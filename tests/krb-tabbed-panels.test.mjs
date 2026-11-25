import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import test from 'node:test';

import { initKrbTabbedPanels } from '../src/components/krb-tabbed-panels.ts';

const labels = ['Discover KRB', 'Apply', 'Meet us', 'Welcome'];
const itemMarkup = (
  label,
  index
) => `<details class="tabbed-panels_item" name="authored-group"${index === 2 ? ' open' : ''}>
  <summary class="tabbed-panels_toggle"><span class="tabbed-panels_step">Step </span><span class="tabbed-panels_title">${label}</span><span data-wf--global-general-icon--icon="arrow-right" aria-hidden="true" class="icon_svg"></span></summary>
  <div class="tabbed-panels_body"><h3>${label}</h3><a href="/step-${index + 1}">Read more</a><img src="/step-${index + 1}.jpg" alt="Step ${index + 1}"></div>
</details>`;
const sectionMarkup = (layout = 'tabs-left', items = labels.map(itemMarkup).join('')) =>
  `<section class="section_tabbed-panels" data-wf--section-tabbed-panels--section-controls-layout="${layout}"><div class="tabbed-panels_items${['tabs-left', 'stacked-left'].includes(layout) ? ' w-variant-2befcd0f-d78f-c3b7-2336-22af926e3628' : ''}" data-details-group="false">${items}</div></section>`;

function setup(markup = sectionMarkup(), mobile = false) {
  const dom = new JSDOM(markup, { url: 'https://krb-v2.webflow.io/admissions' });
  const listeners = [];
  const media = {
    matches: mobile,
    addEventListener(type, callback) {
      assert.equal(type, 'change');
      listeners.push(callback);
    },
    setMobile(next) {
      this.matches = next;
      listeners.forEach((callback) => callback());
    },
  };
  dom.window.matchMedia = (query) => {
    assert.equal(query, '(max-width: 760px)');
    return media;
  };
  return { dom, doc: dom.window.document, media };
}
const getTabs = (root) => [...root.querySelectorAll('button[role="tab"]')];
const getBodies = (root) => [...root.querySelectorAll('.tabbed-panels_body')];
function assertSelection(root, selected) {
  const tabs = getTabs(root);
  const bodies = getBodies(root);
  tabs.forEach((tab, index) => {
    const active = selected === index;
    assert.equal(tab.getAttribute('aria-selected'), String(active));
    assert.equal(tab.tabIndex, active ? 0 : -1);
    assert.equal(bodies[index].hidden, !active);
    assert.equal(bodies[index].inert, !active);
    assert.equal(bodies[index].getAttribute('aria-hidden'), String(!active));
  });
}
function key(dom, tab, value, options = {}) {
  const event = new dom.window.KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  tab.dispatchEvent(event);
  return event.defaultPrevented;
}

test('enhances the four native steps without moving or replacing authored content', () => {
  const { doc } = setup();
  const items = doc.querySelector('.tabbed-panels_items');
  const details = [...items.children];
  const summaries = details.map((item) => item.querySelector('summary'));
  const bodies = getBodies(doc);
  const contents = bodies.map((body) => body.innerHTML);
  bodies[0].id = 'existing-discover-panel';
  initKrbTabbedPanels(doc);
  const tabs = getTabs(doc);
  assert.equal(tabs.length, 4);
  assert.equal(items.dataset.tabbedPanelsReady, 'true');
  assert.equal(items.style.getPropertyValue('--col'), '4');
  assert.equal(items.getAttribute('data-details-group'), 'false');
  assert.equal(items.firstElementChild.getAttribute('role'), 'tablist');
  details.forEach((item, index) => {
    assert.equal(items.children[index + 1], item);
    assert.equal(item.open, true);
    assert.equal(item.hasAttribute('name'), false);
    assert.equal(item.getAttribute('role'), 'presentation');
    assert.equal(item.style.getPropertyValue('--n'), String(index + 1));
    assert.equal(item.style.getPropertyValue('--col'), '4');
    assert.equal(item.querySelector('summary'), summaries[index]);
    assert.equal(summaries[index].hidden, true);
    assert.equal(item.querySelector('.tabbed-panels_body'), bodies[index]);
    assert.equal(bodies[index].innerHTML, contents[index]);
    assert.equal(bodies[index].getAttribute('role'), 'tabpanel');
    assert.equal(bodies[index].getAttribute('aria-labelledby'), tabs[index].id);
    assert.equal(tabs[index].getAttribute('aria-controls'), bodies[index].id);
    assert.equal(tabs[index].type, 'button');
    assert.equal(tabs[index].querySelector('.tabbed-panels_title').textContent, labels[index]);
    assert.equal(tabs[index].querySelector('.icon_svg').getAttribute('aria-hidden'), 'true');
    assert.equal(tabs[index].style.getPropertyValue('--n'), String(index + 1));
    assert.equal(tabs[index].style.getPropertyValue('--col'), '4');
  });
  assert.equal(bodies[0].id, 'existing-discover-panel');
  assertSelection(doc, 0);
});

test('clicking every tab exclusively selects its panel and focuses the control', () => {
  const { doc } = setup();
  initKrbTabbedPanels(doc);
  getTabs(doc).forEach((tab, index) => {
    tab.click();
    assertSelection(doc, index);
    assert.equal(doc.activeElement, tab);
  });
});

test('vertical keyboard navigation wraps, handles Home/End and activates with Enter/Space', () => {
  const { dom, doc } = setup();
  initKrbTabbedPanels(doc);
  const tabs = getTabs(doc);
  assert.equal(doc.querySelector('[role="tablist"]').getAttribute('aria-orientation'), 'vertical');
  tabs[0].focus();
  assert.equal(key(dom, tabs[0], 'ArrowUp'), true);
  assert.equal(doc.activeElement, tabs[3]);
  assertSelection(doc, 3);
  key(dom, tabs[3], 'ArrowDown');
  assertSelection(doc, 0);
  key(dom, tabs[0], 'End');
  assertSelection(doc, 3);
  key(dom, tabs[3], 'Home');
  assertSelection(doc, 0);
  key(dom, tabs[2], 'Enter');
  assertSelection(doc, 2);
  key(dom, tabs[1], ' ');
  assertSelection(doc, 1);
  assert.equal(key(dom, tabs[1], 'ArrowRight'), false);
  assert.equal(key(dom, tabs[1], 'ArrowDown', { ctrlKey: true }), false);
  assertSelection(doc, 1);
});

test('mobile switches to horizontal keys and updates orientation across the breakpoint', () => {
  const { dom, doc, media } = setup(sectionMarkup(), true);
  initKrbTabbedPanels(doc);
  const tabs = getTabs(doc);
  const nav = doc.querySelector('[role="tablist"]');
  assert.equal(nav.getAttribute('aria-orientation'), 'horizontal');
  key(dom, tabs[0], 'ArrowLeft');
  assertSelection(doc, 3);
  key(dom, tabs[3], 'ArrowRight');
  assertSelection(doc, 0);
  assert.equal(key(dom, tabs[0], 'ArrowDown'), false);
  media.setMobile(false);
  assert.equal(nav.getAttribute('aria-orientation'), 'vertical');
  key(dom, tabs[0], 'ArrowDown');
  assertSelection(doc, 1);
  media.setMobile(true);
  assert.equal(nav.getAttribute('aria-orientation'), 'horizontal');
  assertSelection(doc, 1);
});

test('Tabs above stays horizontal on desktop and mobile', () => {
  const { dom, doc, media } = setup(sectionMarkup('tabs-above'));
  initKrbTabbedPanels(doc);
  assert.equal(
    doc.querySelector('[role="tablist"]').getAttribute('aria-orientation'),
    'horizontal'
  );
  key(dom, getTabs(doc)[0], 'ArrowRight');
  assertSelection(doc, 1);
  media.setMobile(true);
  assert.equal(
    doc.querySelector('[role="tablist"]').getAttribute('aria-orientation'),
    'horizontal'
  );
});

test('left tab keyboard direction survives label and property renames', () => {
  for (const label of ['tabs-left', 'stacked-left', 'renamed-again', null]) {
    const { dom, doc, media } = setup();
    const section = doc.querySelector('section');
    if (label === null) section.removeAttribute('data-wf--section-tabbed-panels--section-controls-layout');
    else section.setAttribute('data-wf--section-tabbed-panels--section-controls-layout', label);
    initKrbTabbedPanels(doc);
    const nav = doc.querySelector('[role="tablist"]');
    assert.equal(nav.getAttribute('aria-orientation'), 'vertical');
    assert.equal(key(dom, getTabs(doc)[0], 'ArrowDown'), true);
    assertSelection(doc, 1);
    media.setMobile(true);
    assert.equal(nav.getAttribute('aria-orientation'), 'horizontal');
    assert.equal(key(dom, getTabs(doc)[1], 'ArrowRight'), true);
    assertSelection(doc, 2);
  }
});

test('multiple sections are independent, IDs are unique, and repeated initialization is harmless', () => {
  const { doc } = setup(sectionMarkup() + sectionMarkup());
  const sections = [...doc.querySelectorAll('section')];
  getBodies(doc).forEach((body) => {
    body.id = 'duplicated-authored-id';
  });
  initKrbTabbedPanels(doc);
  const navs = [...doc.querySelectorAll('[role="tablist"]')];
  const ids = [...doc.querySelectorAll('[id]')].map((element) => element.id);
  assert.equal(ids.length, new Set(ids).size);
  getTabs(sections[0])[2].click();
  assertSelection(sections[0], 2);
  assertSelection(sections[1], 0);
  initKrbTabbedPanels(doc);
  assert.deepEqual([...doc.querySelectorAll('[role="tablist"]')], navs);
  assert.equal(getTabs(doc).length, 8);
  assertSelection(sections[0], 2);
});

test('empty, incomplete, interactive, and unrelated markup stays usable and unchanged', () => {
  const malformed = [
    '',
    itemMarkup('Incomplete', 0).replace('class="tabbed-panels_body"', 'class="different-body"'),
    itemMarkup('Incomplete', 0).replace('class="tabbed-panels_toggle"', 'class="different-toggle"'),
    itemMarkup('<a href="/oops">Interactive</a>', 0),
    '<details class="tabbed-panels_item"><summary class="tabbed-panels_toggle"></summary><div class="tabbed-panels_body">Empty label</div></details>',
  ];
  for (const markup of malformed) {
    const { doc } = setup(sectionMarkup('stacked-left', markup));
    const before = doc.body.innerHTML;
    initKrbTabbedPanels(doc);
    assert.equal(doc.body.innerHTML, before);
  }
  const { doc } = setup(
    `<div class="tabbed-panels_items">${itemMarkup('Outside section', 0)}</div>`
  );
  const before = doc.body.innerHTML;
  initKrbTabbedPanels(doc);
  assert.equal(doc.body.innerHTML, before);
});

test('Designer edit mode keeps native details unmodified', () => {
  for (const mode of ['class', 'env']) {
    const { doc, dom } = setup();
    if (mode === 'class') doc.documentElement.classList.add('wf-design-mode');
    else dom.window.Webflow = { env: (name) => name === 'design' };
    const before = doc.body.innerHTML;
    initKrbTabbedPanels(doc);
    assert.equal(doc.body.innerHTML, before);
  }
});
