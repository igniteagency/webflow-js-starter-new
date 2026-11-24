import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareHeroEntrance } from '../src/components/krb-motion.ts';

async function fixture(run, { loaded = true, compact = false, ready = 'ready' } = {}) {
  const saved = new Map(),
    timers = new Map(),
    tweens = [],
    splitters = [],
    events = new Map();
  let serial = 0,
    observe,
    resolveFonts;
  const set = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  const listen = (name, fn) => events.set(name, [...(events.get(name) || []), fn]);
  class Element {
    constructor(name, children = []) {
      this.name = name;
      this.children = children;
      this.dataset = {};
      this.classList = { contains: () => false };
    }
    contains(el) {
      return el === this || this.children.some((child) => child.contains(el));
    }
    getClientRects() {
      return [{}];
    }
  }
  const heading = new Element('title'),
    eyebrow = new Element('eyebrow'),
    intro = new Element('intro'),
    cta = new Element('cta');
  const copy = new Element('copy', [
    eyebrow,
    new Element('heading-wrapper', [heading]),
    intro,
    cta,
  ]);
  copy.querySelector = () => heading;
  const root = { dataset: { krbHero: ready } };
  const fonts = {
    status: loaded ? 'loaded' : 'loading',
    ready: loaded
      ? Promise.resolve()
      : new Promise((r) => {
          resolveFonts = r;
        }),
  };
  set('document', {
    documentElement: root,
    querySelectorAll: () => [copy],
    fonts,
    addEventListener: listen,
    hidden: false,
  });
  set('HTMLElement', Element);
  set('getComputedStyle', () => ({ display: 'block' }));
  const motionQuery = { matches: false, addEventListener: listen };
  set('matchMedia', (query) =>
    query.includes('prefers-reduced') ? motionQuery : { matches: compact, addEventListener: listen }
  );
  set('addEventListener', listen);
  set('scrollY', 0);
  set('setTimeout', (fn, ms) => {
    timers.set(++serial, { fn, ms });
    return serial;
  });
  set('clearTimeout', (id) => timers.delete(id));
  set(
    'MutationObserver',
    class {
      constructor(fn) {
        observe = fn;
      }
      observe() {}
      disconnect() {}
    }
  );
  set('gsap', {
    fromTo(target, from, to) {
      const tween = {
        target,
        from,
        to,
        played: !to.paused,
        reverted: false,
        play() {
          this.played = true;
        },
        revert() {
          this.reverted = true;
        },
        complete() {
          to.onComplete();
        },
      };
      tweens.push(tween);
      return tween;
    },
  });
  set('SplitText', {
    create(target, options) {
      const split = {
        reverted: false,
        lines: [new Element('line')],
        resplit() {
          return options.onSplit(this);
        },
        revert() {
          this.reverted = true;
        },
      };
      splitters.push(split);
      split.resplit();
      return split;
    },
  });
  let controller;
  const state = {
    root,
    heading,
    eyebrow,
    intro,
    cta,
    fonts,
    tweens,
    splitters,
    timers,
    create(options = {}) {
      controller = prepareHeroEntrance({
        eligible: () => true,
        designer: () => false,
        plugins: () => Promise.resolve(),
        ...options,
      });
      return controller;
    },
    emit(name, event = {}) {
      events.get(name)?.forEach((fn) => fn(event));
    },
    ready(value) {
      root.dataset.krbHero = value;
      observe?.();
    },
    reduce() {
      motionQuery.matches = true;
      this.emit('change');
    },
    fontLoaded() {
      fonts.status = 'loaded';
      resolveFonts?.();
    },
    tick(ms) {
      for (const [id, timer] of [...timers])
        if (timer.ms === ms) {
          timers.delete(id);
          timer.fn();
        }
    },
  };
  try {
    await run(state);
  } finally {
    controller?.finish();
    for (const [key, descriptor] of saved)
      descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
}

test('Hero waits for fonts and gives all copy Astro timing, including opacity', async () =>
  fixture(
    async (f) => {
      const controller = f.create();
      const init = controller.init();
      await Promise.resolve();
      assert.equal(f.root.dataset.krbHeroCopy, 'pending');
      assert.equal(f.tweens.length, 0);
      f.fontLoaded();
      await init;
      assert.equal(f.root.dataset.krbHeroCopy, 'running');
      assert.equal(f.tweens.length, 4);
      const title = f.tweens[1];
      assert.equal(title.to.duration, 0.8);
      assert.equal(title.to.delay, 0.09);
      assert.equal(title.from.opacity, 0);
      assert.equal(title.from.yPercent, 110);
      assert.equal(f.tweens[0].to.delay, 0);
      assert.equal(f.tweens[0].to.duration, 0.62);
      assert.equal(f.tweens[2].to.delay, 0.16);
      assert.equal(f.tweens[3].to.delay, 0.16);
      assert.ok(f.tweens.every((t) => t.played));
    },
    { loaded: false }
  ));

test('font/width re-splits retain full-duration tweens until title completion', async () =>
  fixture(async (f) => {
    await f.create().init();
    for (const progress of [0, 0.1, 0.3]) {
      const replacement = f.splitters[0].resplit();
      // SplitText itself carries elapsed totalTime to each returned replacement.
      assert.equal(replacement.to.duration, 0.8, `duration at ${progress}`);
      assert.equal(replacement.from.yPercent, 110);
      assert.equal(replacement.from.opacity, 0);
      assert.equal(replacement.to.paused, false);
    }
    f.tweens.at(-1).complete();
    const completed = f.splitters[0].resplit();
    assert.equal(completed.to.duration, 0);
    assert.equal(completed.from.opacity, 1);
    assert.equal(completed.from.yPercent, 0);
    f.tweens
      .filter((t) => [f.eyebrow, f.intro, f.cta].includes(t.target))
      .forEach((t) => t.complete());
    await Promise.resolve();
    assert.equal(f.root.dataset.krbHeroCopy, undefined);
    assert.ok(f.splitters[0].reverted);
  }));

test('slow fonts use a visible block reveal and never split late', async () =>
  fixture(
    async (f) => {
      const init = f.create().init();
      f.tick(800);
      await init;
      assert.equal(f.splitters.length, 0);
      assert.deepEqual(f.tweens[1].target, [f.heading]);
      assert.equal(f.tweens[1].from.y, 16);
      f.fontLoaded();
      await Promise.resolve();
      assert.equal(f.splitters.length, 0);
    },
    { loaded: false }
  ));

test('Home waits for the opening cue; mobile uses shorter Astro timing', async () =>
  fixture(
    async (f) => {
      await f.create().init();
      assert.equal(f.root.dataset.krbHeroCopy, 'pending');
      assert.ok(f.tweens.every((t) => !t.played));
      f.ready('ready');
      assert.ok(f.tweens.every((t) => t.played));
      assert.equal(f.tweens[1].to.duration, 0.58);
      assert.equal(f.tweens[1].to.delay, 0.063);
      assert.equal(f.tweens[2].to.duration, 0.48);
      assert.equal(f.tweens[2].to.delay, 0.112);
      f.ready('settled');
      assert.equal(f.root.dataset.krbHeroCopy, undefined);
      assert.ok(f.tweens.every((t) => t.reverted));
    },
    { compact: true, ready: 'pending' }
  ));

test('interaction during pending plugins fails open and late resolution cannot rehide', async () =>
  fixture(async (f) => {
    let resolve;
    const init = f
      .create({
        plugins: () =>
          new Promise((r) => {
            resolve = r;
          }),
      })
      .init();
    f.emit('pointerdown');
    assert.equal(f.root.dataset.krbHeroCopy, undefined);
    resolve();
    await init;
    assert.equal(f.tweens.length, 0);
  }));

test('plugin failure and startup deadline both restore native visibility', async () => {
  await fixture(async (f) => {
    const oldError = console.error;
    console.error = () => {};
    try {
      await f.create({ plugins: () => Promise.reject(new Error('offline')) }).init();
    } finally {
      console.error = oldError;
    }
    assert.equal(f.root.dataset.krbHeroCopy, undefined);
  });
  await fixture(async (f) => {
    let resolve;
    const init = f
      .create({
        plugins: () =>
          new Promise((r) => {
            resolve = r;
          }),
      })
      .init();
    f.tick(3200);
    assert.equal(f.root.dataset.krbHeroCopy, undefined);
    resolve();
    await init;
    assert.equal(f.tweens.length, 0);
  });
});

test('restoration and reduced motion settle active copy without replay', async () => {
  for (const event of ['pagehide', 'beforeprint', 'pageshow', 'change'])
    await fixture(async (f) => {
      await f.create().init();
      if (event === 'change') {
        f.reduce();
      } else f.emit(event, { persisted: true });
      assert.equal(f.root.dataset.krbHeroCopy, undefined);
      assert.ok(f.tweens.every((t) => t.reverted));
      f.ready('ready');
      assert.equal(f.root.dataset.krbHeroCopy, undefined);
    });
});
