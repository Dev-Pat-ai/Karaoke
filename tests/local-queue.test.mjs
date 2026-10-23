import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

test('local queue: URL add, duplicate identity, next event, removal, persistence, and missing-service notices', async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
  delete process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000' });
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'SVGElement', 'Node', 'localStorage']) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  const cache = new Map();
  let playerEvents;
  const players = [];
  dom.window.YT = {
    PlayerState: { ENDED: 0, PLAYING: 1 },
    Player: class {
      constructor(target, options) {
        playerEvents = options.events;
        const frame = dom.window.document.createElement('iframe');
        frame.title = 'Mocked YouTube transport';
        target.replaceWith(frame);
        this.frame = frame;
        players.push(options.videoId);
      }
      destroy() { this.frame.remove(); }
    },
  };
  const animationComponents = {};
  const motion = new Proxy({}, { get: (_, tag) => animationComponents[tag] ??= function Animation({ children, ...props }) {
    for (const key of ['initial', 'animate', 'exit', 'transition', 'variants', 'whileTap']) delete props[key];
    return React.createElement(tag, props, children);
  } });
  const stubs = {
    'next/link': function Link({ href, children, ...props }) { return React.createElement('a', { href, ...props }, children); },
    'framer-motion': { motion, AnimatePresence: ({ children }) => children },
    'next/navigation': { useRouter: () => ({ push() {} }) },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file);
    cache.set(file, mod);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    mod.require = specifier => {
      if (specifier in stubs) return stubs[specifier];
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const base = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
        for (const extension of ['.ts', '.tsx']) if (fs.existsSync(base + extension)) return load(base + extension);
      }
      return createRequire(file)(specifier);
    };
    mod._compile(source, file);
    return mod.exports;
  }
  const Home = load('app/online/page.tsx').default;
  let root = createRoot(document.getElementById('root'));
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const click = async element => { assert.ok(element, document.body.textContent); await act(async () => element.click()); await flush(); };
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  await act(async () => root.render(React.createElement(Home)));
  await flush();
  assert.match(document.body.textContent, /Local demo mode/);
  assert.match(document.body.textContent, /YouTube search needs an API key/);
  await click(document.querySelector('[aria-label="Create room"]'));
  assert.match(document.body.textContent, /Shared rooms and cross-device synchronization are disabled/);
  assert.equal(button('Create Room →').disabled, true);
  // Dismiss using the dialog close button, then add URLs through the real forms.
  await click(document.querySelector('.fixed .relative button'));
  await click(button('URL'));
  async function add(id) {
    const input = document.querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, id);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector('input').closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    await click(button('Add'));
  }
  await add('M7lc1UVf-VE');
  await add('M7lc1UVf-VE');
  await add('aqz-KE-bpKQ');
  let state = JSON.parse(localStorage.getItem('karaoke-state'));
  assert.equal(state.queue.length, 3);
  assert.equal(new Set(state.queue.map(item => item.queueId)).size, 3);
  assert.equal(document.querySelectorAll('[aria-label^="Play YouTube video"]').length, 2);
  const firstKey = state.currentQueueId;
  await act(async () => playerEvents.onStateChange({ data: 0 }));
  await flush();
  state = JSON.parse(localStorage.getItem('karaoke-state'));
  assert.equal(state.queue.length, 2);
  assert.notEqual(state.currentQueueId, firstKey);
  assert.equal(state.currentVideoId, 'M7lc1UVf-VE');
  assert.equal(players.length, 2, 'duplicate video gets a new playback instance');
  await click(document.querySelector('[aria-label="Next song"]'));
  state = JSON.parse(localStorage.getItem('karaoke-state'));
  assert.equal(state.currentVideoId, 'aqz-KE-bpKQ');
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Home)));
  await flush();
  state = JSON.parse(localStorage.getItem('karaoke-state'));
  assert.equal(state.queue.length, 1, 'queue survives remount');
  await click(document.querySelector('[aria-label^="Remove YouTube video"]'));
  state = JSON.parse(localStorage.getItem('karaoke-state'));
  assert.equal(state.queue.length, 0);
  assert.equal(state.currentVideoId, null);
  assert.equal(document.querySelectorAll('iframe').length, 0);
  await act(async () => root.unmount());
  dom.window.close();
});
