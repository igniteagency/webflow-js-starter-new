import assert from 'node:assert/strict';
import test from 'node:test';

import { initScrollSequence, initScrollSequences } from '../src/components/krb-scroll-sequence.ts';

const dataName = (name) =>
  `data-${String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
class Element {
  constructor(classes = '') {
    this.attributes = new Map();
    this.children = [];
    this.events = new Map();
    this.classes = new Set(classes.split(' '));
    this.classList = { contains: (name) => this.classes.has(name) };
    this.dataset = new Proxy(
      {},
      {
        get: (_, name) => this.attributes.get(dataName(name)),
        set: (_, name, value) => {
          this.attributes.set(dataName(name), String(value));
          return true;
        },
      }
    );
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  toggleAttribute(name, on) {
    if (on) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }
  addEventListener(name, callback) {
    this.events.set(name, [...(this.events.get(name) || []), callback]);
  }
  emit(name) {
    this.events.get(name)?.forEach((callback) => callback());
  }
  matches() {
    return this.attributes.has('hidden') || this.classes.has('w-condition-invisible');
  }
  closest() {
    return this.section;
  }
  querySelector(selector) {
    return this.parts?.[selector] || null;
  }
  querySelectorAll(selector) {
    return this.lists?.[selector] || [];
  }
}

function fixture({
  height = 800,
  count = 4,
  natural = 190,
  imageHeight = 450,
  enabled = true,
  supported = true,
  designer = false,
  headerHeight = 91,
  top = 300,
} = {}) {
  const root = new Element('section_scroll-sequence');
  const steps = new Element('scroll-sequence_steps');
  steps.section = root;
  root.lists = { '.scroll-sequence_steps': [steps] };
  const frames = new Map();
  let nextFrame = 0;
  const windowEvents = new Map();
  const resizeObservers = [],
    mutations = [],
    intersections = [];
  const media = {
    matches: enabled,
    callbacks: [],
    addEventListener: (_, callback) => media.callbacks.push(callback),
  };
  const header = headerHeight === null ? null : { offsetHeight: headerHeight };
  let fontReady;
  const doc = {
    documentElement: { classList: { contains: () => designer } },
    querySelector: () => header,
    fonts: {
      ready: {
        then(callback) {
          fontReady = callback;
        },
      },
    },
  };
  const view = {
    innerHeight: height,
    scrollY: 0,
    CSS: { supports: () => supported },
    matchMedia(query) {
      assert.equal(
        query,
        '(min-width: 992px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)'
      );
      return media;
    },
    requestAnimationFrame(callback) {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    addEventListener(name, callback) {
      windowEvents.set(name, [...(windowEvents.get(name) || []), callback]);
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.targets = new Set();
        resizeObservers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      disconnect() {
        this.targets.clear();
      }
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        mutations.push(this);
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
    },
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        intersections.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.disconnected = true;
      }
    },
  };
  doc.defaultView = view;
  root.ownerDocument = doc;
  const pairs = [];
  const rowHeight = (pair) => {
    const flow =
      root.dataset.scrollSequenceSpacing === 'flow' ||
      (!root.dataset.scrollSequenceSpacing && view.innerHeight <= 849);
    return flow
      ? Math.max(pair.copy.naturalHeight, view.innerHeight * 0.6)
      : pair.copy.naturalHeight;
  };
  const addPair = (value = natural) => {
    const item = new Element('scroll-sequence_item');
    const figure = new Element('image-wrapper');
    const copy = new Element('heading-lockup');
    const image = { loading: 'lazy' };
    const clip = new Element('image-clip'),
      caption = new Element();
    copy.children = [new Element('heading-lockup_top'), new Element('heading-lockup_bottom')];
    copy.naturalHeight = value;
    figure.getBoundingClientRect = () => ({ top: 100, height: imageHeight });
    figure.lists = { img: [image], '.image-clip, figcaption': [clip, caption] };
    item.parts = { ':scope > .image-wrapper': figure, ':scope > .heading-lockup': copy };
    item.children = [figure, copy];
    item.section = root;
    const pair = { item, figure, copy, image };
    copy.getBoundingClientRect = () => ({
      top:
        top -
        view.scrollY +
        pairs.slice(0, pairs.indexOf(pair)).reduce((sum, prev) => sum + rowHeight(prev), 0),
      height: rowHeight(pair),
    });
    pairs.push(pair);
    steps.children.push(item);
    return pair;
  };
  for (let i = 0; i < count; i++) addPair();
  const flush = () => {
    let cycles = 0;
    while (frames.size) {
      assert.ok(++cycles < 10, 'layout observer caused a frame loop');
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    }
  };
  const emit = (name) => {
    windowEvents.get(name)?.forEach((callback) => callback());
    flush();
  };
  return {
    root,
    steps,
    view,
    doc,
    pairs,
    media,
    frames,
    mutations,
    resizeObservers,
    intersections,
    addPair,
    flush,
    emit,
    fonts: () => {
      fontReady?.();
      flush();
    },
    scroll(y) {
      view.scrollY = y;
      emit('scroll');
    },
    resize(h) {
      view.innerHeight = h;
      emit('resize');
    },
    enable(on) {
      media.matches = on;
      media.callbacks.forEach((callback) => callback());
      flush();
    },
    mutate() {
      mutations.forEach((observer) => observer.callback([]));
      flush();
    },
  };
}
function active(f) {
  return f.pairs.map(({ item }) => item.getAttribute('data-scroll-sequence-active') === 'true');
}
function assertActive(f, index) {
  assert.deepEqual(
    active(f),
    f.pairs.map((_, i) => i === index)
  );
  f.pairs.forEach(({ item, figure }, i) => {
    assert.equal(item.getAttribute('aria-current'), i === index ? 'step' : null);
    assert.equal(figure.getAttribute('aria-hidden'), String(i !== index));
    assert.equal(figure.attributes.has('inert'), i !== index);
  });
}

test('intrinsic compact measurement selects flow at 800px and compact at 1000px', () => {
  const f = fixture();
  initScrollSequence(f.root);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'flow');
  assert.equal(f.root.dataset.scrollSequenceMotion, 'timed');
  f.resize(1000);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'compact');
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
  assert.equal(
    f.pairs.every(({ figure }) => figure.getAttribute('aria-hidden') === null),
    true
  );
  f.resize(800);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'flow');
});

test('short-screen CSS fallback does not contaminate intrinsic fit measurement', () => {
  const f = fixture({ natural: 100, imageHeight: 400 });
  initScrollSequence(f.root);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'compact');
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
});

test('fit uses the taller of image and copy and actual header height with 48px clearance', () => {
  const f = fixture({ natural: 100, imageHeight: 700 });
  initScrollSequence(f.root);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'flow');
  f.resize(839);
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'compact');
  const noHeader = fixture({ natural: 100, imageHeight: 662, headerHeight: null });
  initScrollSequence(noHeader.root);
  assert.equal(noHeader.root.dataset.scrollSequenceSpacing, 'compact');
});

test('flow selects nearest copy center, including jumps, reversals and stable ties', () => {
  const f = fixture();
  initScrollSequence(f.root);
  assertActive(f, 0);
  f.scroll(620);
  assertActive(f, 1);
  f.scroll(1580);
  assertActive(f, 3);
  f.scroll(1100);
  assertActive(f, 2);
  f.scroll(0);
  assertActive(f, 0);
  f.scroll(380);
  assertActive(f, 0);
  f.scroll(381);
  assertActive(f, 1);
});

test('reduced motion, mobile and short-height cleanup restore native readable pairs', () => {
  const f = fixture();
  f.pairs[0].figure.setAttribute('aria-hidden', 'false');
  initScrollSequence(f.root);
  f.scroll(1100);
  assertActive(f, 2);
  f.enable(false);
  assert.equal(f.root.dataset.scrollSequenceSpacing, undefined);
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
  f.pairs.forEach(({ item, figure }, i) => {
    assert.equal(item.getAttribute('data-scroll-sequence-active'), null);
    assert.equal(item.getAttribute('aria-current'), null);
    assert.equal(figure.getAttribute('aria-hidden'), i === 0 ? 'false' : null);
    assert.equal(figure.attributes.has('inert'), false);
  });
  f.enable(true);
  assertActive(f, 2);
});

test('font, content, image and resize changes remeasure without observing flow row sizing', () => {
  const f = fixture({ natural: 100, imageHeight: 400 });
  initScrollSequence(f.root);
  const observed = [...f.resizeObservers[0].targets];
  assert.equal(
    observed.some((target) => f.pairs.some(({ copy }) => copy === target)),
    false
  );
  f.pairs.forEach(({ copy }) => {
    copy.naturalHeight = 190;
  });
  f.fonts();
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'flow');
  f.pairs.forEach(({ copy }) => {
    copy.naturalHeight = 100;
  });
  f.root.emit('load');
  f.flush();
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'compact');
  f.addPair(300);
  f.mutate();
  assert.equal(f.root.dataset.scrollSequenceSpacing, 'flow');
  assert.equal(active(f).filter(Boolean).length, 1);
  assert.equal(
    f.mutations[0].options.attributeFilter.includes('data-scroll-sequence-active'),
    false
  );
});

test('preloads only near viewport and includes newly added items', () => {
  const f = fixture();
  initScrollSequence(f.root);
  assert.equal(
    f.pairs.every(({ image }) => image.loading === 'lazy'),
    true
  );
  const observer = f.intersections[0];
  assert.equal(observer.options.rootMargin, '600px');
  observer.callback([{ isIntersecting: false }]);
  assert.equal(f.pairs[0].image.loading, 'lazy');
  observer.callback([{ isIntersecting: true }]);
  assert.equal(
    f.pairs.every(({ image }) => image.loading === 'eager'),
    true
  );
  assert.equal(observer.disconnected, true);
  const added = f.addPair();
  f.mutate();
  assert.equal(added.image.loading, 'eager');
});

test('nested and multiple sections initialize independently and duplicate calls add no handlers', () => {
  const outer = fixture();
  const nested = fixture({ top: 2000 });
  outer.root.lists['.scroll-sequence_steps'].unshift(nested.steps);
  initScrollSequences({ querySelectorAll: () => [outer.root, nested.root] });
  outer.scroll(1100);
  assertActive(outer, 2);
  assertActive(nested, 0);
  const observers = outer.resizeObservers.length;
  initScrollSequence(outer.root);
  assert.equal(outer.resizeObservers.length, observers);
  outer.scroll(1580);
  assertActive(outer, 3);
  assertActive(nested, 0);
});

test('Designer, unsupported capabilities, empty and malformed input stay native', () => {
  for (const options of [{ designer: true }, { supported: false }, { count: 0 }]) {
    const f = fixture(options);
    initScrollSequence(f.root);
    assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
    assert.equal(f.root.dataset.scrollSequenceSpacing, undefined);
  }
  const f = fixture();
  f.pairs[1].item.parts[':scope > .heading-lockup'] = null;
  initScrollSequence(f.root);
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
  assert.equal(
    f.pairs.every(({ figure }) => figure.getAttribute('aria-hidden') === null),
    true
  );
});

test('explicit stacked layout and conditionally omitted items never force enhancement', () => {
  const f = fixture();
  initScrollSequence(f.root);
  f.root.dataset.scrollSequenceDisplay = 'stacked';
  f.mutate();
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
  f.root.dataset.scrollSequenceDisplay = 'sequence';
  f.mutate();
  assert.equal(f.root.dataset.scrollSequenceMotion, 'timed');
  f.pairs[1].item.setAttribute('hidden', '');
  f.mutate();
  assert.equal(f.root.dataset.scrollSequenceMotion, undefined);
  assert.equal(
    f.pairs.every(({ figure }) => !figure.attributes.has('inert')),
    true
  );
});
