import assert from 'node:assert/strict';
import test from 'node:test';

import { initFilmReveal } from '../src/components/film-reveal.ts';

function fixture({
  reduced = false,
  saveData = false,
  sticky = true,
  source = 'https://example.test/film.mp4',
} = {}) {
  const events = new Map(),
    videoEvents = new Map(),
    buttonEvents = new Map();
  let observer;
  const motion = { matches: reduced, addEventListener() {} };
  const video = {
    paused: true,
    ended: false,
    plays: 0,
    attrs: {},
    play() {
      this.paused = false;
      this.plays++;
      videoEvents.get('play')?.();
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      videoEvents.get('pause')?.();
    },
    addEventListener(n, f) {
      videoEvents.set(n, f);
    },
    setAttribute(n, v) {
      this.attrs[n] = v;
    },
    removeAttribute(n) {
      delete this.attrs[n];
    },
  };
  const toggle = {
    addEventListener(n, f) {
      buttonEvents.set(n, f);
    },
    setAttribute() {},
  };
  const status = { textContent: '' };
  const track = {
    offsetHeight: 2200,
    top: 0,
    getBoundingClientRect() {
      return { top: this.top };
    },
  };
  const stage = { offsetHeight: 1000 };
  const parts = {
    video,
    toggle,
    status,
    controls: {},
    '.film-reveal_track': track,
    '.film-reveal_stage': stage,
  };
  const root = {
    dataset: { filmRevealSrc: source, filmRevealEnabled: 'True' },
    querySelector(s) {
      return parts[s.match(/part="(.+)"/)?.[1] || s];
    },
  };
  globalThis.document = {
    hidden: false,
    addEventListener(n, f) {
      events.set(n, f);
    },
  };
  globalThis.matchMedia = () => motion;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { connection: { saveData } },
  });
  globalThis.getComputedStyle = () => ({ position: sticky ? 'sticky' : 'relative' });
  globalThis.requestAnimationFrame = (f) => {
    queueMicrotask(f);
    return 1;
  };
  globalThis.window = {
    addEventListener(n, f) {
      events.set(n, f);
    },
    IntersectionObserver: class {},
    loadScript: async () => {},
    VideoManagerPlayer: { mount() {}, destroy() {} },
  };
  globalThis.IntersectionObserver = class {
    constructor(f) {
      observer = f;
    }
    observe() {}
  };
  initFilmReveal(root);
  const settle = async () => {
    await new Promise((r) => setImmediate(r));
  };
  return {
    root,
    video,
    status,
    track,
    motion,
    events,
    videoEvents,
    async visible(on) {
      observer([{ isIntersecting: on, intersectionRatio: on ? 1 : 0 }]);
      await settle();
    },
    async scroll(top) {
      track.top = top;
      events.get('scroll')();
      await settle();
    },
    async click() {
      buttonEvents.get('click')();
      await settle();
    },
    settle,
  };
}

test('desktop gates playback until heart starts opening and pauses offscreen', async () => {
  const f = fixture();
  await f.visible(true);
  assert.equal(f.video.plays, 0);
  await f.scroll(-300);
  assert.equal(f.video.paused, false);
  await f.visible(false);
  assert.equal(f.video.paused, true);
});
test('manual pause persists across visibility and scrolling', async () => {
  const f = fixture({ sticky: false });
  await f.visible(true);
  await f.click();
  await f.visible(false);
  await f.visible(true);
  await f.scroll(-400);
  assert.equal(f.video.paused, true);
  await f.click();
  assert.equal(f.video.paused, false);
});
test('reduced motion and Save Data require deliberate play', async () => {
  for (const options of [{ reduced: true }, { saveData: true }]) {
    const f = fixture(options);
    await f.visible(true);
    await f.scroll(-900);
    assert.equal(f.video.plays, 0);
    await f.click();
    assert.equal(f.video.paused, false);
  }
});
test('HLS uses manager attachment and errors remain retryable', async () => {
  const f = fixture({
    sticky: false,
    source: 'https://example.test/video-manager/media/asset/playlist.m3u8',
  });
  await f.visible(true);
  assert.match(f.video.attrs['data-video-src'], /playlist.m3u8$/);
  f.videoEvents.get('video-player-error')();
  assert.match(f.status.textContent, /Retry/);
  f.video.paused = true;
  await f.click();
  assert.equal(f.status.textContent, '');
});
test('empty source leaves the image-only component untouched', () => {
  const f = fixture({ source: '' });
  assert.equal(f.root.dataset.filmVideoReady, undefined);
});
