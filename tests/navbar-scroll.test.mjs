import assert from 'node:assert/strict';
import test from 'node:test';
import { initNavbarScroll } from '../src/components/navbar-scroll.ts';

function fixture({ heroBottom = 720, y = 0, mobile = false } = {}) {
  const events = new Map();
  let frame;
  const classes = new Set();
  const part = { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
  const panel = { open: false, matches() { return this.open; }, addEventListener(n, fn) { events.set(n, fn); } };
  const view = {
    scrollY: y, innerHeight: 720,
    matchMedia: () => ({ matches: mobile }),
    requestAnimationFrame(fn) { frame = fn; },
    addEventListener(n, fn) { events.set(n, fn); },
  };
  const root = {
    ...part, dataset: {}, focused: false,
    querySelectorAll: () => [part],
    querySelector(s) { return s === '[popover]' ? panel : this.focused ? {} : null; },
    setAttribute(n, value) { this[n] = value; },
    addEventListener(n, fn) { events.set(n, fn); },
    ownerDocument: {
      defaultView: view,
      documentElement: { classList: { contains: () => false }, scrollHeight: 4000 },
      querySelector: () => heroBottom === null ? null : { getBoundingClientRect: () => ({ bottom: heroBottom - view.scrollY }) },
    },
  };
  initNavbarScroll(root);
  const scroll = (y) => { view.scrollY = y; events.get('scroll')(); frame(); };
  return { root, panel, view, events, classes, scroll };
}

test('both starting variants get the same over-hero and compact behaviour', () => {
  for (const mobile of [false, true]) {
    const f = fixture({ mobile });
    assert.equal(f.root['data-wf--section-navbar--variant'], 'over-image');
    assert.equal(f.root.dataset.navbarScrollHidden, 'false');
    f.scroll(120);
    assert.equal(f.root.dataset.navbarScrollHidden, 'true');
    f.scroll(110);
    assert.equal(f.root.dataset.navbarScrollHidden, 'false');
    assert.equal(f.root['data-wf--section-navbar--variant'], 'over-image');
    f.scroll(800);
    assert.equal(f.root['data-wf--section-navbar--variant'], 'solid');
    assert.equal(f.root.dataset.navbarScrollHidden, 'true');
    f.scroll(780);
    assert.equal(f.root.dataset.navbarScrollHidden, 'false');
    f.scroll(0);
    assert.equal(f.root['data-wf--section-navbar--variant'], 'over-image');
    assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  }
});

test('tiny reversals do not flicker and the top zone remains visible', () => {
  const f = fixture();
  f.scroll(40);
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  f.scroll(140);
  f.scroll(137);
  assert.equal(f.root.dataset.navbarScrollHidden, 'true');
  f.scroll(129);
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
});

test('open menu and keyboard focus keep the header available', () => {
  const f = fixture();
  f.scroll(800);
  f.panel.open = true;
  f.events.get('toggle')();
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  f.scroll(900);
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  f.panel.open = false;
  f.root.focused = true;
  f.scroll(1000);
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  f.root.focused = false;
  f.scroll(1100);
  assert.equal(f.root.dataset.navbarScrollHidden, 'true');
});

test('restored scroll positions, no-hero pages, and repeat initialization are safe', () => {
  const f = fixture({ y: 1000 });
  assert.equal(f.root['data-wf--section-navbar--variant'], 'solid');
  assert.equal(f.root.dataset.navbarScrollHidden, 'false');
  const handler = f.events.get('scroll');
  initNavbarScroll(f.root);
  assert.equal(f.events.get('scroll'), handler);
  const plain = fixture({ heroBottom: null });
  assert.equal(plain.root['data-wf--section-navbar--variant'], 'solid');
});
