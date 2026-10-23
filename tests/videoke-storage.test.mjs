import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createLoader } from "./helpers/load-ts.mjs";

test("library: atomic video copy, concurrent unique codes, deduplication, edit, quota rollback and delete", async () => {
  globalThis.indexedDB = new IDBFactory();
  const library = createLoader()("lib/videoke/library.ts");
  const file = new File(
    ["original test bytes"],
    "Test Artist - Original Test.mp4",
    { lastModified: 1 },
  );
  const first = await library.importSong(file, "OPM");
  assert.equal(first.song.code, "00001");
  assert.equal(first.song.title, "Original Test");
  assert.equal(first.song.artist, "Test Artist");
  assert.equal((await library.getMedia(first.song.id)).type, "video/mp4");
  assert.equal(
    await (await library.getMedia(first.song.id)).text(),
    "original test bytes",
  );
  assert.equal((await library.importSong(file, "English")).duplicate, true);
  const others = await Promise.all([
    library.importSong(
      new File(["two"], "Second.webm", { lastModified: 2 }),
      "English",
    ),
    library.importSong(
      new File(["three"], "Third.mp4", { lastModified: 3 }),
      "Custom",
    ),
  ]);
  assert.equal(
    new Set([first, ...others].map((entry) => entry.song.code)).size,
    3,
  );
  await assert.rejects(
    library.updateSong(others[0].song.id, {
      code: "1",
      title: "Duplicate",
      artist: "Test",
      category: "English",
    }),
  );
  assert.equal(
    (await library.listSongs()).find((song) => song.id === others[0].song.id)
      .title,
    "Second",
  );
  await library.updateSong(others[0].song.id, {
    code: "42",
    title: "Edited title",
    artist: "A singer",
    category: "Family favourites",
  });
  assert.equal(
    (await library.listSongs()).find((song) => song.id === others[0].song.id)
      .code,
    "00042",
  );
  assert.equal(
    (await library.getMedia(others[0].song.id)).size,
    3,
    "metadata edit preserves video",
  );
  await assert.rejects(
    library.importSong(new File(["x"], "audio.mp3"), "OPM"),
    /MP4 or WebM/,
  );
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "media")
      throw new DOMException("Full", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  try {
    await assert.rejects(
      library.importSong(new File(["four"], "Quota.mp4"), "OPM"),
      { name: "QuotaExceededError" },
    );
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.equal(
    (await library.listSongs()).length,
    3,
    "quota failure commits neither media nor song metadata",
  );
  const afterFailure = await library.importSong(
    new File(["five"], "Next.mp4"),
    "OPM",
  );
  assert.equal(
    afterFailure.song.code,
    "00004",
    "failed import does not consume a code",
  );
  await library.deleteSong(first.song.id);
  assert.equal((await library.listSongs()).length, 3);
  await assert.rejects(library.getMedia(first.song.id), /missing/);
  assert.equal(
    await file.text(),
    "original test bytes",
    "original selection is untouched",
  );
  (await library.openLibrary()).close();
});

test("session: singer reservations, duplicates, reordering, next, previous, removal and safe restoration", () => {
  const {
    emptySession,
    sessionReducer: reduce,
    restoreSession,
    searchSongs,
  } = createLoader()("lib/videoke/session.ts");
  const a = { id: "a", songId: "one", singer: "Lola" };
  const b = { id: "b", songId: "one", singer: "Tito" };
  const c = { id: "c", songId: "two", singer: "Ate" };
  let state = reduce(emptySession, { type: "reserve", reservation: a });
  state = reduce(state, { type: "reserve", reservation: b });
  state = reduce(state, { type: "reserve", reservation: c });
  assert.equal(state.current.singer, "Lola");
  state = reduce(state, { type: "move", id: "c", direction: -1 });
  assert.deepEqual(
    state.queue.map((entry) => entry.id),
    ["c", "b"],
  );
  state = reduce(state, { type: "next" });
  assert.equal(state.current.id, "c");
  state = reduce(state, { type: "previous" });
  assert.equal(state.current.id, "a");
  assert.deepEqual(
    state.queue.map((entry) => entry.id),
    ["c", "b"],
  );
  state = reduce(state, { type: "remove", id: "c" });
  state = reduce(state, { type: "position", seconds: 32 });
  const songs = [
    {
      id: "one",
      code: "00001",
      title: "Original Test",
      artist: "Test Artist",
      category: "OPM",
    },
    {
      id: "two",
      code: "00002",
      title: "Another Test",
      artist: "Other",
      category: "English",
    },
  ];
  const restored = restoreSession(JSON.stringify(state), songs);
  assert.equal(restored.position, 32);
  assert.equal(restored.current.singer, "Lola");
  assert.equal(restored.queue[0].singer, "Tito");
  assert.equal(restoreSession("{broken", songs).current, null);
  assert.equal(restoreSession(JSON.stringify(state), []).queue.length, 0);
  const forgotten = reduce(restored, { type: "forget-song", songId: "one" });
  assert.equal(forgotten.current, null);
  assert.equal(forgotten.queue.length, 0);
  assert.equal(searchSongs(songs, "1", "All")[0].id, "one");
  assert.equal(searchSongs(songs, "test artist", "OPM")[0].id, "one");
  assert.equal(searchSongs(songs, "", "English").length, 1);
});
