import assert from 'node:assert/strict';
import test from 'node:test';

import { initNativeVideo } from '../src/components/native-video.ts';

function fixture(player = false, reduced = false) {
  const listeners = new Map();
  const video = {
    dataset: { videoPlayer: String(player) },
    style: {},
    paused: true,
    controls: true,
    muted: true,
    loop: true,
    autoplay: true,
    playsInline: false,
    removeAttribute(name) {
      this[name] = false;
    },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    play() {
      this.paused = false;
      listeners.get('play')?.();
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      listeners.get('pause')?.();
    },
  };
  const toggle = {
    hidden: true,
    style: {},
    addEventListener(name, fn) {
      this.click = fn;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const playIcon = { hidden: false, style: {} };
  const pauseIcon = { hidden: true, style: {} };
  const observer = {};
  const view = {
    matchMedia() {
      return { matches: reduced, addEventListener() {} };
    },
    navigator: { connection: { saveData: false, addEventListener() {} } },
    IntersectionObserver: class {
      constructor(callback) {
        observer.change = callback;
      }
      observe() {}
    },
  };
  const document = {
    defaultView: view,
    hidden: false,
    addEventListener(name, fn) {
      this[name] = fn;
    },
  };
  const elements = { player: video, toggle, 'play-icon': playIcon, 'pause-icon': pauseIcon };
  const root = {
    dataset: {},
    ownerDocument: document,
    querySelector(selector) {
      return elements[selector.match(/="([^"]+)"/)[1]];
    },
  };
  return { root, video, toggle, playIcon, pauseIcon, observer, document, view };
}

test('player removes boolean autoplay muted loop and retains native controls without auto starting', () => {
  const f = fixture(true);
  f.video.dataset.videoPlayer = 'True';
  initNativeVideo(f.root);
  assert.equal(f.video.autoplay, false);
  assert.equal(f.video.muted, false);
  assert.equal(f.video.loop, false);
  assert.equal(f.video.controls, true);
  assert.equal(f.video.paused, true);
  assert.equal(f.toggle.hidden, true);
  assert.equal(f.video.style.objectFit, 'contain');
});

test('reduced motion and save data keep poster until explicit play; background tabs pause', async () => {
  for (const preference of ['motion', 'data']) {
    const f = fixture(false, preference === 'motion');
    f.view.navigator.connection.saveData = preference === 'data';
    initNativeVideo(f.root);
    f.observer.change([{ isIntersecting: true }]);
    await Promise.resolve();
    assert.equal(f.video.paused, true);
    f.toggle.click();
    await Promise.resolve();
    assert.equal(f.video.paused, false);
    f.document.hidden = true;
    f.document.visibilitychange();
    assert.equal(f.video.paused, true);
  }
});

test('background autoplays only in view and exposes a working persistent pause control', async () => {
  const f = fixture();
  initNativeVideo(f.root);
  assert.equal(f.video.paused, true);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.loop, true);
  assert.equal(f.video.controls, false);
  assert.equal(f.toggle.hidden, false);
  f.observer.change([{ isIntersecting: true }]);
  await Promise.resolve();
  assert.equal(f.video.paused, false);
  assert.equal(f.toggle['aria-label'], 'Pause video');
  f.toggle.click();
  assert.equal(f.video.paused, true);
  f.observer.change([{ isIntersecting: false }]);
  f.observer.change([{ isIntersecting: true }]);
  assert.equal(f.video.paused, true);
});
