import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { createLoader } from "./helpers/load-ts.mjs";

test("videoke console: imports, native media events, reservations, controls, scores, editing and refresh recovery without network", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:3000",
  });
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "HTMLVideoElement",
    "Node",
    "localStorage",
  ]) {
    Object.defineProperty(globalThis, name, {
      value: dom.window[name],
      configurable: true,
    });
  }
  globalThis.indexedDB = new IDBFactory();
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.confirm = () => true;
  let networkCalls = 0;
  globalThis.fetch = () => {
    networkCalls++;
    throw new Error("Local mode must not use a network request");
  };
  const media = new Map();
  const revoked = [];
  URL.createObjectURL = (blob) => {
    const url = `blob:test-${media.size}`;
    media.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  let playCalls = 0,
    blocked = false;
  const paused = new WeakMap();
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, "paused", {
    get() {
      return paused.get(this) ?? true;
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, "duration", {
    get() {
      return 120;
    },
    configurable: true,
  });
  Object.defineProperty(
    dom.window.HTMLMediaElement.prototype,
    "preservesPitch",
    { value: true, writable: true, configurable: true },
  );
  dom.window.HTMLMediaElement.prototype.play = function () {
    playCalls++;
    if (blocked)
      return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
    paused.set(this, false);
    this.dispatchEvent(new dom.window.Event("play"));
    this.dispatchEvent(new dom.window.Event("playing"));
    return Promise.resolve();
  };
  dom.window.HTMLMediaElement.prototype.pause = function () {
    paused.set(this, true);
    this.dispatchEvent(new dom.window.Event("pause"));
  };
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const load = createLoader({
    "next/link": function Link({ href, children, ...props }) {
      return React.createElement("a", { href, ...props }, children);
    },
  });
  const Console = load("components/videoke/VideokeConsole.tsx").default;
  const { SESSION_KEY } = load("lib/videoke/session.ts");
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const until = async (predicate) => {
    for (let attempt = 0; attempt < 30 && !predicate(); attempt++)
      await flush();
    assert.ok(predicate(), document.body.textContent);
  };
  const find = (label) =>
    [...document.querySelectorAll("button")].find(
      (element) => element.getAttribute("aria-label") === label,
    );
  const click = async (element) => {
    assert.ok(element, document.body.textContent);
    await act(async () => element.click());
    await flush();
  };
  async function change(element, value) {
    assert.ok(element);
    await act(async () => {
      const prototype =
        element.tagName === "SELECT"
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(
        element,
        value,
      );
      element.dispatchEvent(
        new dom.window.Event(
          element.tagName === "SELECT" ? "change" : "input",
          { bubbles: true },
        ),
      );
    });
    await flush();
  }
  async function metadata() {
    for (
      let attempt = 0;
      attempt < 20 && !document.querySelector("video");
      attempt++
    )
      await flush();
    assert.ok(document.querySelector("video"), document.body.textContent);
    await act(async () =>
      document
        .querySelector("video")
        .dispatchEvent(new dom.window.Event("loadedmetadata")),
    );
    await flush();
  }
  const state = () => JSON.parse(localStorage.getItem(SESSION_KEY));
  let root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Console)));
  await flush();
  assert.match(
    document.body.textContent,
    /Your next favourite is on your computer/,
  );
  const files = [
    new File(["original fixture one"], "Test Artist - First Test.mp4", {
      lastModified: 10,
    }),
    new File(["original fixture two"], "Other Artist - Second Test.webm", {
      lastModified: 11,
    }),
  ];
  const picker = document.querySelector('[data-testid="video-import"]');
  Object.defineProperty(picker, "files", { value: files, configurable: true });
  await act(async () =>
    picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })),
  );
  await flush();
  assert.match(document.body.textContent, /2 songs imported/);
  assert.match(document.querySelector("#songbook").textContent, /00001/);
  assert.match(document.querySelector("#songbook").textContent, /00002/);
  await change(document.querySelector('[placeholder="Singer name"]'), "Lola");
  await click(find("Reserve First Test"));
  await metadata();
  const firstUrl = document.querySelector("video").src;
  assert.equal(media.get(firstUrl).size, files[0].size);
  assert.equal(state().current.singer, "Lola");
  assert.equal(playCalls, 1);
  assert.equal(document.querySelector("video").volume, 0.8);
  await click(find("Reserve First Test"));
  await click(find("Reserve Second Test"));
  assert.equal(state().queue.length, 2);
  assert.notEqual(state().queue[0].id, state().current.id);
  await click(find("Move Second Test up"));
  assert.equal(
    state().queue[0].songId,
    (await load("lib/videoke/library.ts").listSongs())[1].id,
  );
  await click(find("Next song"));
  await metadata();
  assert.ok(revoked.includes(firstUrl), "old video object URL is released");
  assert.match(
    document.querySelector("video").getAttribute("aria-label"),
    /Second Test/,
  );
  await change(document.querySelector(".volume-control input"), "0.35");
  assert.equal(document.querySelector("video").volume, 0.35);
  await change(document.querySelector('[aria-label="Tempo"]'), "1.1");
  assert.equal(document.querySelector("video").playbackRate, 1.1);
  await click(find("Pause"));
  assert.ok(find("Play"));
  blocked = true;
  await click(find("Play"));
  assert.match(document.body.textContent, /browser paused autoplay/);
  blocked = false;
  await click(find("Play"));
  assert.ok(find("Pause"));
  await click(find("Repeat song"));
  const repeated = state().current.id;
  await act(async () =>
    document
      .querySelector("video")
      .dispatchEvent(new dom.window.Event("ended")),
  );
  await flush();
  assert.equal(state().current.id, repeated);
  assert.equal(document.querySelector("video").currentTime, 0);
  await click(find("Repeat song"));
  await click(document.querySelector(".party-switch input"));
  const realTimeout = globalThis.setTimeout;
  let scoreTimer, finishScore;
  globalThis.setTimeout = (callback, delay, ...args) => {
    const timer = realTimeout(callback, delay, ...args);
    if (delay === 5000) {
      scoreTimer = timer;
      finishScore = callback;
    }
    return timer;
  };
  await act(async () =>
    document
      .querySelector("video")
      .dispatchEvent(new dom.window.Event("ended")),
  );
  await flush();
  assert.match(
    document.querySelector(".party-score").textContent,
    /SIMULATED PARTY SCORE/,
  );
  assert.match(
    document.querySelector(".party-score").textContent,
    /No microphone or singing analysis/,
  );
  assert.equal(
    typeof finishScore,
    "function",
    "score schedules the five-second transition",
  );
  clearTimeout(scoreTimer);
  await act(async () => finishScore());
  globalThis.setTimeout = realTimeout;
  await metadata();
  assert.match(
    document.querySelector("video").getAttribute("aria-label"),
    /First Test/,
  );
  await click(document.querySelector(".party-switch input"));
  await act(async () =>
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "2", bubbles: true }),
    ),
  );
  await flush();
  assert.match(document.querySelector(".tv-entry").textContent, /00002/);
  await act(async () =>
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  await flush();
  assert.equal(state().queue.length, 1);
  await click(find("Toggle TV fullscreen"));
  assert.ok(
    document.querySelector(".tv-theater"),
    "unsupported fullscreen falls back to TV view",
  );
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    ),
  );
  assert.equal(document.querySelector(".tv-theater"), null);
  await change(document.querySelector(".seek-line input"), "34");
  assert.equal(document.querySelector("video").currentTime, 34);
  assert.equal(state().position, 34);
  const playsBeforeRestore = playCalls;
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Console)));
  await flush();
  await metadata();
  assert.equal(
    playCalls,
    playsBeforeRestore,
    "refresh requires deliberate playback, not an autoplay bypass",
  );
  assert.equal(document.querySelector("video").currentTime, 34);
  assert.equal(state().current.singer, "Lola");
  assert.equal(state().queue.length, 1);
  await click(find("Edit Second Test"));
  const inputs = document.querySelectorAll("dialog form input");
  await change(inputs[0], "42");
  await change(inputs[3], "Family favourites");
  await act(async () =>
    document
      .querySelector("dialog form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  await flush();
  assert.match(document.querySelector("#songbook").textContent, /00042/);
  await until(() => !document.querySelector("dialog"));
  await change(
    document.querySelector('[aria-label="Filter category"]'),
    "Family favourites",
  );
  assert.equal(document.querySelectorAll(".songbook-list > li").length, 1);
  await click(find("Edit Second Test"));
  await click(document.querySelector("dialog .danger"));
  await until(() => state().queue.length === 0);
  assert.equal(
    state().queue.length,
    0,
    "removing a media copy prunes pending reservations",
  );
  assert.equal((await load("lib/videoke/library.ts").listSongs()).length, 1);
  await act(async () =>
    document
      .querySelector("video")
      .dispatchEvent(new dom.window.Event("error")),
  );
  assert.match(document.body.textContent, /cannot be decoded/);
  await act(async () =>
    document
      .querySelector("video")
      .dispatchEvent(new dom.window.Event("ended")),
  );
  await flush();
  assert.equal(state().current, null);
  assert.equal(
    find("Previous song").disabled,
    false,
    "history remains playable after the last song",
  );
  delete dom.window.HTMLMediaElement.prototype.preservesPitch;
  await click(find("Previous song"));
  await metadata();
  assert.ok(document.querySelector("video"));
  assert.equal(document.querySelector('[aria-label="Tempo"]').disabled, true);
  assert.equal(
    document.querySelector("video").playbackRate,
    1,
    "unsupported tempo preserves normal playback",
  );
  assert.equal(networkCalls, 0);
  assert.ok(localStorage.getItem(SESSION_KEY).length < 4000);
  assert.equal(
    localStorage.getItem(SESSION_KEY).includes("original fixture"),
    false,
  );
  await act(async () => root.unmount());
  (await load("lib/videoke/library.ts").openLibrary()).close();
  dom.window.close();
});
