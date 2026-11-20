import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { imageRole, initImageFallbacks, scrollValues } from '../src/components/krb-motion.ts';

test('full-image shrink and parallax share entry, midpoint and exit across a viewport', () => {
  const entry = scrollValues('full', 900, 600, 900, false);
  const middle = scrollValues('full', 150, 600, 900, false);
  const exit = scrollValues('full', -600, 600, 900, false);
  assert.deepEqual(entry, { translate: -54, scale: 1.12 });
  assert.deepEqual(middle, { translate: 0, scale: 1.06 });
  assert.deepEqual(exit, { translate: 54, scale: 1 });
  assert.deepEqual(scrollValues('full', -900, 600, 900, false), exit);
});
test('hero begins without a translate jump and standalone/mobile movement stays reduced', () => {
  assert.equal(scrollValues('hero', 0, 600, 900, false).translate, 0);
  assert.equal(scrollValues('hero', -600, 600, 900, false).translate, 54);
  assert.equal(scrollValues('standalone', 900, 600, 900, false).translate, -12);
  assert.equal(scrollValues('standalone', 900, 600, 900, true).translate, -6);
  assert.equal(scrollValues('full', 900, 600, 900, true).scale, 1.07);
});
test('card and film photos do not enter the scroll-parallax roles', () => {
  const image = {
    closest: () => null,
    matches: () => false,
    parentElement: { matches: () => true },
  };
  assert.equal(imageRole(image), 'card');
  image.parentElement.matches = () => false;
  image.matches = (selector) => selector === '.blog_image-wrapper';
  assert.equal(imageRole(image), 'card');
  image.closest = () => ({});
  assert.equal(imageRole(image), 'none');
});

function boot({
  motion = false,
  hash = '',
  scroll = 0,
  navigation = 'navigate',
  pathname = '/',
} = {}) {
  const root = { dataset: {} },
    events = new Map(),
    timers = new Map();
  let timer = 0;
  const context = {
    document: {
      documentElement: root,
      hidden: false,
      readyState: 'loading',
      addEventListener: (name, fn) => events.set(name, fn),
    },
    window: {},
    location: { pathname, hash },
    scrollY: scroll,
    matchMedia: () => ({ matches: motion, addEventListener() {} }),
    performance: { getEntriesByType: () => [{ type: navigation }] },
    AbortController,
    setTimeout: (fn) => {
      timers.set(++timer, fn);
      return timer;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, fn) => events.set(name, fn),
  };
  vm.runInNewContext(
    readFileSync(new URL('../dist/prod/components/krb-motion.js', import.meta.url), 'utf8'),
    context
  );
  return { root, events, timers };
}
test('the opening arms before DOM content and immediately settles on user interaction', () => {
  const fixture = boot();
  assert.equal(fixture.root.dataset.krbOpening, 'pending');
  assert.equal(fixture.root.dataset.krbHero, 'pending');
  fixture.events.get('pointerdown')();
  assert.equal(fixture.root.dataset.krbOpening, undefined);
  assert.equal(fixture.root.dataset.krbHero, 'settled');
  assert.equal(fixture.timers.size, 0);
});
test('initial viewport resize does not cancel a pending opening before measurement', () => {
  const fixture = boot();
  fixture.events.get('resize')();
  assert.equal(fixture.root.dataset.krbOpening, 'pending');
  assert.equal(fixture.root.dataset.krbHero, 'pending');
  fixture.events.get('pointerdown')();
  assert.equal(fixture.root.dataset.krbOpening, undefined);
});
test('the opening fails open if initialisation never completes', () => {
  const fixture = boot();
  [...fixture.timers.values()][0]();
  assert.equal(fixture.root.dataset.krbOpening, undefined);
  assert.equal(fixture.root.dataset.krbHero, 'settled');
});
test('reduced motion, deep links, restored positions and back navigation stay unobstructed', () => {
  for (const options of [
    { motion: true },
    { hash: '#intro' },
    { scroll: 100 },
    { navigation: 'back_forward' },
    { pathname: '/about' },
  ]) {
    const fixture = boot(options);
    assert.equal(fixture.root.dataset.krbOpening, undefined);
    assert.equal(fixture.timers.size, 0);
  }
});

test('simple reveal fallbacks are inert with native triggers and mark entered parents only without them', () => {
  for (const native of [true, false]) {
    const events = new Map(),
      observed = new Set();
    const element = {
      dataset: {},
      closest: () => null,
      getBoundingClientRect: () => ({ top: 1200, bottom: 1400 }),
    };
    let notify;
    const saved = new Map();
    const set = (name, value) => {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    };
    set('document', {
      querySelectorAll: (selector) =>
        selector.includes('sacred-heart-network_art') ? [element] : [],
      addEventListener: (name, callback) => events.set(name, callback),
      hidden: false,
    });
    set('CSS', {
      supports: (property) => (property.startsWith('animation-trigger') ? native : true),
    });
    set('matchMedia', () => ({ matches: false, addEventListener() {} }));
    set('window', { IntersectionObserver: true });
    set('innerHeight', 1000);
    set('addEventListener', (name, callback) => events.set(name, callback));
    set(
      'IntersectionObserver',
      class {
        constructor(callback) {
          notify = callback;
        }
        observe(target) {
          observed.add(target);
        }
        unobserve(target) {
          observed.delete(target);
        }
        disconnect() {
          observed.clear();
        }
      }
    );
    try {
      initImageFallbacks();
      assert.equal(observed.size, native ? 0 : 1);
      assert.equal(element.dataset.motionTrigger, undefined);
      if (!native) {
        notify([{ target: element, isIntersecting: true, boundingClientRect: { bottom: 800 } }]);
        assert.equal(element.dataset.motionTrigger, 'visible');
        assert.equal(observed.size, 0);
      }
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  }
});
