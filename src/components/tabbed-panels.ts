const SECTION_SELECTOR = '.section_tabbed-panels';
const COMPONENT_SELECTOR = '.tabbed-panels_component';
const MOBILE_QUERY = '(max-width: 767px)';
const READY_ATTRIBUTE = 'data-tabbed-panels-ready';

let nextId = 0;

function allocateId(element: HTMLElement, reserved: Set<string>): string {
  if (element.id && !reserved.has(element.id)) {
    const matches = Array.from(element.ownerDocument.querySelectorAll('[id]')).filter(
      (node) => node.id === element.id
    );
    if (matches.length === 1) {
      reserved.add(element.id);
      return element.id;
    }
  }

  let id: string;
  do {
    id = `krb-tabbed-panels-${++nextId}`;
  } while (element.ownerDocument.getElementById(id) || reserved.has(id));
  reserved.add(id);
  return id;
}

function snapshotAttributes(element: HTMLElement): () => void {
  const attributes = Array.from(element.attributes, ({ name, value }) => [name, value]);
  return () => {
    Array.from(element.attributes).forEach(({ name }) => element.removeAttribute(name));
    attributes.forEach(([name, value]) => element.setAttribute(name, value));
  };
}

export function initTabbedPanelsSection(section: HTMLElement): boolean {
  if (!section.matches(SECTION_SELECTOR)) return false;
  const components = Array.from(section.querySelectorAll<HTMLElement>(COMPONENT_SELECTOR)).filter(
    (component) => component.closest(SECTION_SELECTOR) === section
  );
  if (components.length !== 1) return false;

  const component = components[0];
  if (component.getAttribute(READY_ATTRIBUTE) === 'true') return true;
  const menus = component.querySelectorAll<HTMLElement>(':scope > .tabbed-panels_tabs');
  const groups = component.querySelectorAll<HTMLElement>(':scope > .tabbed-panels_panels');
  if (menus.length !== 1 || groups.length !== 1) return false;
  const menu = menus[0];
  const group = groups[0];
  if (menu.childElementCount || menu.textContent?.trim()) return false;
  const panels = Array.from(group.children) as HTMLElement[];
  if (panels.length < 2 || panels.some((panel) => !panel.matches('section.tabbed-panels_panel'))) {
    return false;
  }

  const buttons: HTMLButtonElement[] = [];
  for (const panel of panels) {
    const triggers = panel.querySelectorAll<HTMLButtonElement>(':scope > button.tabbed-panels_tab');
    if (triggers.length !== 1 || triggers[0].disabled) return false;
    const title = triggers[0].querySelector('.tabbed-panels_title');
    if (!title?.textContent?.trim()) return false;
    buttons.push(triggers[0]);
  }
  const view = section.ownerDocument.defaultView;
  if (!view?.matchMedia) return false;

  const rollback = [component, menu, ...panels, ...buttons].map(snapshotAttributes);
  const cleanup: (() => void)[] = [];
  const origins = buttons.map((button) => ({
    button,
    parent: button.parentNode!,
    next: button.nextSibling,
  }));

  try {
    const media = view.matchMedia(MOBILE_QUERY);
    const reserved = new Set<string>();
    const ids = panels.map((panel, index) => ({
      panel: allocateId(panel, reserved),
      button: allocateId(buttons[index], reserved),
    }));
    const setText = (element: Element, text: string) => {
      const original = Array.from(element.childNodes);
      rollback.push(() => element.replaceChildren(...original));
      element.textContent = text;
    };
    const setOrientation = () => {
      menu.setAttribute('aria-orientation', media.matches ? 'horizontal' : 'vertical');
    };
    const activate = (index: number, focus = false) => {
      buttons.forEach((button, position) => {
        const selected = position === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        panels[position].hidden = !selected;
        panels[position].toggleAttribute('inert', !selected);
        panels[position].setAttribute('aria-hidden', String(!selected));
      });
      if (focus) buttons[index].focus();
    };

    menu.setAttribute('role', 'tablist');
    if (!menu.hasAttribute('aria-label') && !menu.hasAttribute('aria-labelledby')) {
      const heading = Array.from(section.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(
        (node) => !component.contains(node) && node.closest(SECTION_SELECTOR) === section
      );
      menu.setAttribute('aria-label', heading?.textContent?.trim() || 'Steps');
    }
    setOrientation();
    media.addEventListener('change', setOrientation);
    cleanup.push(() => media.removeEventListener('change', setOrientation));

    panels.forEach((panel, index) => {
      const button = buttons[index];
      const pair = ids[index];
      panel.id = pair.panel;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', pair.button);
      panel.tabIndex = 0;
      button.id = pair.button;
      button.type = 'button';
      button.hidden = false;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', pair.panel);
      button.querySelectorAll('.tabbed-panels_step').forEach((step) => {
        setText(step, `Step ${index + 1}`);
      });
      panel.querySelectorAll('[data-tabbed-panel-step]').forEach((step) => {
        if (step.closest('.tabbed-panels_panel') === panel) {
          setText(step, `Step ${index + 1} of ${panels.length}`);
        }
      });

      const click = () => activate(index, true);
      const keydown = (event: KeyboardEvent) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let target: number;
        const previous = media.matches ? 'ArrowLeft' : 'ArrowUp';
        const next = media.matches ? 'ArrowRight' : 'ArrowDown';
        if (event.key === previous) target = (index + panels.length - 1) % panels.length;
        else if (event.key === next) target = (index + 1) % panels.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = panels.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') target = index;
        else return;
        event.preventDefault();
        activate(target, true);
      };
      button.addEventListener('click', click);
      cleanup.push(() => button.removeEventListener('click', click));
      button.addEventListener('keydown', keydown);
      cleanup.push(() => button.removeEventListener('keydown', keydown));
      menu.append(button);
    });

    menu.hidden = false;
    activate(0);
    component.setAttribute(READY_ATTRIBUTE, 'true');
    return true;
  } catch (error) {
    cleanup.reverse().forEach((dispose) => dispose());
    origins.forEach(({ button, parent, next }) => parent.insertBefore(button, next));
    rollback.reverse().forEach((restore) => restore());
    console.error('Tabbed Panels initialization failed; readable content restored.', error);
    return false;
  }
}

export function initTabbedPanels(root: ParentNode = document): void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
  if (root.nodeType === 1 && (root as HTMLElement).matches(SECTION_SELECTOR)) {
    sections.unshift(root as HTMLElement);
  }
  sections.forEach(initTabbedPanelsSection);
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initTabbedPanels());
}
