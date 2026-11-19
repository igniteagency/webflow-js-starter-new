const LABEL_SELECTOR = '.button_component [data-el="button-word-label"]';
const WORD_CLASS = 'button_word';
const TEXT_CLASS = 'button_word-text';
const STATE_KEY = Symbol.for('webflow.button-words');
const WHITESPACE = /^[\t\n\f\r ]+$/;

interface ButtonWordsState {
  refresh: (root: Node) => void;
  observer: MutationObserver;
}

type ButtonWordsDocument = Document & { [STATE_KEY]?: ButtonWordsState };

function hasWordMarkup(label: HTMLElement, parts: string[]) {
  const nodes = Array.from(label.childNodes);
  return (
    nodes.length === parts.length &&
    parts.every((part, index) => {
      const node = nodes[index];
      if (WHITESPACE.test(part)) return node.nodeType === 3 && node.textContent === part;
      if (node.nodeType !== 1) return false;
      const word = node as HTMLElement;
      const text = word.firstElementChild;
      return (
        word.className === WORD_CLASS &&
        word.childNodes.length === 1 &&
        text?.className === TEXT_CLASS &&
        text.childNodes.length === 1 &&
        text.firstChild?.nodeType === 3 &&
        text.textContent === part
      );
    })
  );
}

export function splitButtonLabel(label: HTMLElement) {
  // Leave authored rich/interactive content intact; this helper owns plain labels only.
  if (Array.from(label.children).some((child) => child.className !== WORD_CLASS)) return;
  const parts = (label.textContent || '').split(/([\t\n\f\r ]+)/).filter(Boolean);
  if (hasWordMarkup(label, parts)) return;

  const doc = label.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const part of parts) {
    if (WHITESPACE.test(part)) {
      fragment.append(doc.createTextNode(part));
      continue;
    }
    const word = doc.createElement('span');
    word.className = WORD_CLASS;
    const text = doc.createElement('span');
    text.className = TEXT_CLASS;
    text.textContent = part;
    word.append(text);
    fragment.append(word);
  }
  label.replaceChildren(fragment);
}

export function initButtonWords(doc: ButtonWordsDocument = document) {
  const existing = doc[STATE_KEY];
  if (existing) {
    existing.refresh(doc);
    return existing;
  }

  const collect = (root: Node, labels: Set<HTMLElement>) => {
    const element = root.nodeType === 1 ? (root as HTMLElement) : root.parentElement;
    const owner = element?.closest<HTMLElement>(LABEL_SELECTOR);
    if (owner) labels.add(owner);
    if (root.nodeType === 1 || root.nodeType === 9) {
      (root as Element | Document)
        .querySelectorAll<HTMLElement>(LABEL_SELECTOR)
        .forEach((label) => labels.add(label));
    }
  };
  const refresh = (root: Node) => {
    const labels = new Set<HTMLElement>();
    collect(root, labels);
    labels.forEach(splitButtonLabel);
  };
  const observer = new MutationObserver((records) => {
    const labels = new Set<HTMLElement>();
    for (const record of records) {
      const target = record.target;
      const element = target.nodeType === 1 ? (target as HTMLElement) : target.parentElement;
      const label = element?.closest<HTMLElement>(LABEL_SELECTOR);
      if (label) labels.add(label);
      record.addedNodes.forEach((node) => collect(node, labels));
    }
    labels.forEach((label) => {
      if (label.isConnected) splitButtonLabel(label);
    });
  });
  const state = { refresh, observer };
  doc[STATE_KEY] = state;
  refresh(doc);
  observer.observe(doc, { childList: true, characterData: true, subtree: true });
  return state;
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initButtonWords());
}
