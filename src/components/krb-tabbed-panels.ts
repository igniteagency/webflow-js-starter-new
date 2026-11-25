const SECTION_SELECTOR = '.section_tabbed-panels';
const ITEMS_SELECTOR = '.tabbed-panels_items';
const LEFT_LAYOUT_CLASS = 'w-variant-2befcd0f-d78f-c3b7-2336-22af926e3628';
const MOBILE_QUERY = '(max-width: 760px)';
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, details, summary, iframe, script, style, [tabindex], [contenteditable]';
let idIndex = 0;

function uniqueId(doc: Document, kind: string) {
  let id: string;
  do {
    id = `krb-tabbed-${kind}-${++idIndex}`;
  } while (doc.getElementById(id));
  return id;
}

function initGroup(items: HTMLElement) {
  if (items.dataset.tabbedPanelsReady === 'true') return;
  const section = items.closest<HTMLElement>(SECTION_SELECTOR);
  const doc = items.ownerDocument;
  const view = doc.defaultView;
  if (!section || !view || doc.documentElement.classList.contains('wf-design-mode')) return;
  if (view.Webflow?.env?.('design')) return;

  const details = Array.from(
    items.querySelectorAll<HTMLDetailsElement>(':scope > details.tabbed-panels_item')
  );
  if (!details.length || items.querySelector(':scope > .tabbed-panels_navigation')) return;
  const parts = details.map((item) => ({
    item,
    summary: item.querySelector<HTMLElement>(':scope > summary.tabbed-panels_toggle'),
    body: item.querySelector<HTMLElement>(':scope > .tabbed-panels_body'),
  }));
  if (
    parts.some(
      ({ summary, body }) =>
        !summary ||
        !body ||
        !summary.textContent?.trim() ||
        summary.querySelector(INTERACTIVE_SELECTOR) ||
        Array.from(summary.children).some((child) => child.tagName !== 'SPAN')
    )
  ) {
    return;
  }

  const navigation = doc.createElement('div');
  navigation.className = 'tabbed-panels_navigation';
  navigation.setAttribute('role', 'tablist');
  navigation.setAttribute('aria-label', items.getAttribute('aria-label') || 'Explore the steps');
  const mobile = view.matchMedia(MOBILE_QUERY);
  const setOrientation = () => {
    const vertical = items.classList.contains(LEFT_LAYOUT_CLASS) && !mobile.matches;
    navigation.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  };
  setOrientation();

  const controls = parts.map(({ summary }, index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'tabbed-panels_toggle';
    button.id = uniqueId(doc, 'tab');
    button.setAttribute('role', 'tab');
    button.style.setProperty('--n', String(index + 1));
    button.style.setProperty('--col', String(parts.length));
    summary!.childNodes.forEach((node) => {
      if (node.nodeType === 3) button.append(node.cloneNode());
      else if (node.nodeType === 1) {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id'));
        button.append(clone);
      }
    });
    navigation.append(button);
    return button;
  });

  const select = (selected: number, focus = false) => {
    parts.forEach(({ body }, index) => {
      const active = index === selected;
      controls[index].setAttribute('aria-selected', String(active));
      controls[index].tabIndex = active ? 0 : -1;
      body!.hidden = !active;
      body!.inert = !active;
      body!.setAttribute('aria-hidden', String(!active));
    });
    if (focus) controls[selected].focus();
  };

  items.setAttribute('data-details-group', 'false');
  items.style.setProperty('--col', String(parts.length));
  parts.forEach(({ item, summary, body }, index) => {
    item.removeAttribute('name');
    item.open = true;
    item.setAttribute('role', 'presentation');
    item.style.setProperty('--n', String(index + 1));
    item.style.setProperty('--col', String(parts.length));
    summary!.hidden = true;
    if (
      !body!.id ||
      Array.from(doc.querySelectorAll('[id]')).filter((el) => el.id === body!.id).length > 1
    ) {
      body!.id = uniqueId(doc, 'panel');
    }
    body!.setAttribute('role', 'tabpanel');
    body!.setAttribute('aria-labelledby', controls[index].id);
    body!.tabIndex = 0;
    controls[index].setAttribute('aria-controls', body!.id);
    controls[index].addEventListener('click', () => select(index, true));
    controls[index].addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const vertical = navigation.getAttribute('aria-orientation') === 'vertical';
      let next: number;
      switch (event.key) {
        case vertical ? 'ArrowDown' : 'ArrowRight':
          next = (index + 1) % controls.length;
          break;
        case vertical ? 'ArrowUp' : 'ArrowLeft':
          next = (index - 1 + controls.length) % controls.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = controls.length - 1;
          break;
        case 'Enter':
        case ' ':
          next = index;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next, true);
    });
  });
  select(0);
  items.prepend(navigation);
  mobile.addEventListener('change', setOrientation);
  items.dataset.tabbedPanelsReady = 'true';
}

export function initKrbTabbedPanels(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(`${SECTION_SELECTOR} ${ITEMS_SELECTOR}`).forEach(initGroup);
}

if (typeof document !== 'undefined') {
  const init = () => initKrbTabbedPanels();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
