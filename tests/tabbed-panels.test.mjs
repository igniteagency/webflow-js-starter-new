import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { initTabbedPanels, initTabbedPanelsSection } from '../src/components/tabbed-panels.ts';

function markup(titles = ['Explore', 'Visit', 'Talk']) {
  return `<section class="section_tabbed-panels"><h2>A clear way forward</h2>
    <div class="tabbed-panels_component"><div class="tabbed-panels_tabs"></div>
      <div class="tabbed-panels_panels">${titles
        .map(
          (title) => `
        <section class="tabbed-panels_panel">
          <button class="tabbed-panels_tab"><span class="tabbed-panels_step"></span>
            <span class="tabbed-panels_title">${title}</span><svg aria-hidden="true"></svg></button>
          <div><p data-tabbed-panel-step></p><h3>${title}</h3><p>Readable ${title} content</p></div>
          <a href="/${title.toLowerCase()}">Learn more</a>
        </section>`
        )
        .join('')}
      </div>
    </div>
  </section>`;
}

function fixture(html = markup(), width = 1000) {
  const dom = new JSDOM(html);
  const { window } = dom;
  const { document } = window;
  const listeners = new Set();
  const media = {
    matches: width <= 767,
    addEventListener(name, listener) {
      assert.equal(name, 'change');
      listeners.add(listener);
    },
    removeEventListener(name, listener) {
      assert.equal(name, 'change');
      listeners.delete(listener);
    },
  };
  window.matchMedia = (query) => {
    assert.equal(query, '(max-width: 767px)');
    return media;
  };
  const section = document.querySelector('.section_tabbed-panels');
  const component = section?.querySelector('.tabbed-panels_component');
  const menu = component?.querySelector('.tabbed-panels_tabs');
  const panels = [...(component?.querySelector('.tabbed-panels_panels')?.children || [])];
  const buttons = panels.map((panel) => panel.querySelector('button'));
  return {
    dom,
    window,
    document,
    section,
    component,
    menu,
    panels,
    buttons,
    listeners,
    resize(nextWidth) {
      media.matches = nextWidth <= 767;
      listeners.forEach((listener) => listener({ matches: media.matches }));
    },
    key(button, key, extras = {}) {
      const event = new window.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...extras,
      });
      button.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

function selected(f) {
  return f.buttons.findIndex((button) => button.getAttribute('aria-selected') === 'true');
}

test('built browser IIFE queues Webflow-ready initialization and runs without module globals', () => {
  const dom = new JSDOM(markup(), { runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  dom.window.eval(
    readFileSync(new URL('../dist/prod/components/tabbed-panels.js', import.meta.url), 'utf8')
  );
  assert.equal(dom.window.Webflow.length, 1);
  assert.equal(dom.window.document.querySelector('[role="tab"]'), null);
  dom.window.Webflow[0]();
  assert.equal(dom.window.document.querySelectorAll('[role="tab"]').length, 3);
  assert.equal(dom.window.document.querySelectorAll('[role="tabpanel"]').length, 3);
});

test('relocates each original native button once and exposes reciprocal tab semantics', () => {
  const f = fixture();
  let preservedListener = 0;
  f.buttons[1].addEventListener('click', () => preservedListener++);
  assert.equal(initTabbedPanelsSection(f.section), true);
  assert.equal(f.menu.getAttribute('role'), 'tablist');
  assert.equal(f.menu.getAttribute('aria-label'), 'A clear way forward');
  assert.equal(f.menu.getAttribute('aria-orientation'), 'vertical');
  assert.deepEqual([...f.menu.children], f.buttons);
  f.buttons.forEach((button, index) => {
    assert.equal(button.getAttribute('role'), 'tab');
    assert.equal(button.type, 'button');
    assert.equal(button.getAttribute('aria-controls'), f.panels[index].id);
    assert.equal(f.panels[index].getAttribute('aria-labelledby'), button.id);
    assert.equal(f.panels[index].getAttribute('role'), 'tabpanel');
    assert.equal(button.querySelector('.tabbed-panels_step').textContent, `Step ${index + 1}`);
    assert.equal(
      f.panels[index].querySelector('[data-tabbed-panel-step]').textContent,
      `Step ${index + 1} of 3`
    );
    assert.equal(f.panels[index].tabIndex, 0);
  });
  assert.equal(f.buttons.filter((button) => button.tabIndex === 0).length, 1);
  assert.equal(selected(f), 0);
  assert.equal(f.document.activeElement, f.document.body, 'initialization does not steal focus');
  f.buttons[1].click();
  assert.equal(preservedListener, 1, 'same button, original listeners intact');
  assert.equal(selected(f), 1);
  assert.equal(f.document.activeElement, f.buttons[1]);
  f.panels.forEach((panel, index) => {
    assert.equal(panel.hidden, index !== 1);
    assert.equal(panel.hasAttribute('inert'), index !== 1);
    assert.equal(panel.getAttribute('aria-hidden'), String(index !== 1));
  });
});

test('desktop arrows wrap and activate; Home/End and Enter/Space work; unrelated keys pass through', () => {
  const f = fixture();
  initTabbedPanels(f.document);
  assert.equal(f.key(f.buttons[0], 'ArrowUp'), true);
  assert.equal(selected(f), 2);
  assert.equal(f.key(f.buttons[2], 'ArrowDown'), true);
  assert.equal(selected(f), 0);
  assert.equal(f.key(f.buttons[0], 'End'), true);
  assert.equal(selected(f), 2);
  assert.equal(f.key(f.buttons[2], 'Home'), true);
  assert.equal(selected(f), 0);
  assert.equal(f.key(f.buttons[1], 'Enter'), true);
  assert.equal(selected(f), 1);
  assert.equal(f.key(f.buttons[2], ' '), true);
  assert.equal(selected(f), 2);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Tab', 'Escape']) {
    assert.equal(f.key(f.buttons[2], key), false);
    assert.equal(selected(f), 2);
  }
  assert.equal(f.key(f.buttons[2], 'Home', { ctrlKey: true }), false);
});

test('767px mobile menu uses horizontal row-major navigation; Up/Down keep browser scrolling', () => {
  const f = fixture(markup(), 767);
  initTabbedPanels(f.section);
  assert.equal(f.menu.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(f.key(f.buttons[0], 'ArrowRight'), true);
  assert.equal(selected(f), 1);
  assert.equal(f.key(f.buttons[1], 'ArrowRight'), true);
  assert.equal(selected(f), 2);
  assert.equal(f.key(f.buttons[2], 'ArrowRight'), true);
  assert.equal(selected(f), 0);
  assert.equal(f.key(f.buttons[0], 'ArrowLeft'), true);
  assert.equal(selected(f), 2);
  assert.equal(f.key(f.buttons[2], 'ArrowDown'), false);
  assert.equal(f.key(f.buttons[2], 'ArrowUp'), false);
  assert.equal(selected(f), 2);
  f.resize(768);
  assert.equal(f.menu.getAttribute('aria-orientation'), 'vertical');
  assert.equal(selected(f), 2, 'resize retains selection');
  assert.equal(f.key(f.buttons[2], 'ArrowDown'), true);
  assert.equal(selected(f), 0);
  f.resize(760);
  assert.equal(f.menu.getAttribute('aria-orientation'), 'horizontal');
});

test('repeated initialization is inert, including a second independently loaded module copy', async () => {
  const f = fixture();
  initTabbedPanels(f.document);
  f.buttons[1].click();
  const before = f.section.outerHTML;
  initTabbedPanels(f.section);
  const secondCopy = await import('../src/components/tabbed-panels.ts?independent-copy');
  secondCopy.initTabbedPanels(f.document);
  assert.equal(f.section.outerHTML, before);
  assert.equal(f.listeners.size, 1);
  assert.equal(selected(f), 1);
});

test('multiple sections get unique IDs, preserve unique authored anchors, and remain independent', () => {
  const f = fixture(markup() + markup(['Apply', 'Enrol']));
  f.panels[0].id = 'explore-anchor';
  f.buttons[0].id = 'same-id';
  f.buttons[1].id = 'same-id';
  initTabbedPanels(f.document);
  assert.equal(f.panels[0].id, 'explore-anchor');
  const elements = [...f.document.querySelectorAll('[role="tab"], [role="tabpanel"]')];
  assert.equal(new Set(elements.map((node) => node.id)).size, 10);
  const second = f.document.querySelectorAll('.section_tabbed-panels')[1];
  const secondBefore = second.outerHTML;
  f.buttons[2].click();
  assert.equal(second.outerHTML, secondBefore);
});

test('zero/one item, invalid later item, unknown slot child and unavailable platform stay readable and untouched', () => {
  const cases = [fixture(markup([])), fixture(markup(['Only']))];
  const invalidLater = fixture();
  invalidLater.buttons[2].remove();
  cases.push(invalidLater);
  const unknown = fixture();
  unknown.component
    .querySelector('.tabbed-panels_panels')
    .append(unknown.document.createElement('div'));
  cases.push(unknown);
  const noMedia = fixture();
  noMedia.window.matchMedia = undefined;
  cases.push(noMedia);
  const disabled = fixture();
  disabled.buttons[1].disabled = true;
  cases.push(disabled);
  const emptyLabel = fixture();
  emptyLabel.buttons[1].querySelector('.tabbed-panels_title').textContent = ' ';
  cases.push(emptyLabel);
  for (const f of cases) {
    const before = f.section.outerHTML;
    assert.equal(initTabbedPanelsSection(f.section), false);
    assert.equal(f.section.outerHTML, before);
    assert.equal(
      f.section.querySelector(
        '.tabbed-panels_panel[hidden], .tabbed-panels_panel[inert], .tabbed-panels_panel[aria-hidden="true"]'
      ),
      null
    );
    assert.equal(f.listeners.size, 0);
  }
});

test('runtime exception rolls back moved nodes, attributes, numbering and listeners, permitting a clean retry', () => {
  const f = fixture();
  const before = f.section.outerHTML;
  const append = f.menu.append.bind(f.menu);
  let count = 0;
  f.menu.append = (...nodes) => {
    if (++count === 2) throw new Error('simulated relocation failure');
    append(...nodes);
  };
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(initTabbedPanelsSection(f.section), false);
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.equal(f.section.outerHTML, before);
  assert.equal(f.listeners.size, 0);
  f.buttons[0].click();
  assert.equal(f.section.outerHTML, before, 'rolled-back listeners have no side effects');
  f.menu.append = append;
  assert.equal(initTabbedPanelsSection(f.section), true);
  assert.equal(f.listeners.size, 1);
});

test('numbering follows rendered order/count after editing; panel body content is preserved', () => {
  const f = fixture();
  const group = f.panels[0].parentElement;
  group.prepend(f.panels[2]);
  f.panels[1].remove();
  const nested = f.document.createElement('div');
  nested.innerHTML = '<h4>Custom Visit content</h4><ul><li>Tour</li><li>Meet staff</li></ul>';
  f.panels[0].append(nested);
  initTabbedPanels(f.document);
  assert.equal(f.menu.children[0], f.buttons[2]);
  assert.equal(f.buttons[2].querySelector('.tabbed-panels_step').textContent, 'Step 1');
  assert.equal(f.panels[0].querySelector('[data-tabbed-panel-step]').textContent, 'Step 2 of 2');
  assert.equal(nested.parentElement, f.panels[0]);
  assert.equal(nested.querySelectorAll('li').length, 2);
});

test('unrelated starter components and nested tabbed sections are not mutated by the outer section', () => {
  const f = fixture(
    markup() +
      '<div class="tabbed-content_tabs"><details open><summary>Existing</summary>Text</details></div>'
  );
  const starter = f.document.querySelector('.tabbed-content_tabs');
  const starterBefore = starter.outerHTML;
  f.panels[1].insertAdjacentHTML('beforeend', markup(['Nested A', 'Nested B']));
  const nested = f.panels[1].querySelector('.section_tabbed-panels');
  const nestedBefore = nested.outerHTML;
  initTabbedPanelsSection(f.section);
  assert.equal(nested.outerHTML, nestedBefore);
  assert.equal(starter.outerHTML, starterBefore);
  initTabbedPanels(f.document);
  assert.equal(nested.querySelectorAll('[role="tab"]').length, 2);
  assert.equal(starter.outerHTML, starterBefore);
});
