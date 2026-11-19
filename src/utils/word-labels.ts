const WHITESPACE = /^[\t\n\f\r ]+$/;

export interface WordLabelsState {
  refresh: (root: Node) => void;
  observer: MutationObserver;
}

interface WordLabelOptions {
  wordClass: string;
  textClass: string;
  indexProperty?: string;
}

interface WordLabelsOptions extends WordLabelOptions {
  selector: string;
  stateKey: symbol;
}

function hasWordMarkup(label: HTMLElement, parts: string[], options: WordLabelOptions) {
  let wordIndex = 0;
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
        word.className === options.wordClass &&
        (!options.indexProperty ||
          word.style.getPropertyValue(options.indexProperty) === String(wordIndex++)) &&
        word.childNodes.length === 1 &&
        text?.className === options.textClass &&
        text.childNodes.length === 1 &&
        text.firstChild?.nodeType === 3 &&
        text.textContent === part
      );
    })
  );
}

export function splitWordLabel(label: HTMLElement, options: WordLabelOptions) {
  // Leave authored rich/interactive content intact; this helper owns plain labels only.
  if (Array.from(label.children).some((child) => child.className !== options.wordClass)) return;
  const parts = (label.textContent || '').split(/([\t\n\f\r ]+)/).filter(Boolean);
  if (hasWordMarkup(label, parts, options)) return;

  const doc = label.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let wordIndex = 0;
  for (const part of parts) {
    if (WHITESPACE.test(part)) {
      fragment.append(doc.createTextNode(part));
      continue;
    }
    const word = doc.createElement('span');
    word.className = options.wordClass;
    if (options.indexProperty) word.style.setProperty(options.indexProperty, String(wordIndex++));
    const text = doc.createElement('span');
    text.className = options.textClass;
    text.textContent = part;
    word.append(text);
    fragment.append(word);
  }
  label.replaceChildren(fragment);
}

export function initWordLabels(doc: Document, options: WordLabelsOptions) {
  const owner = doc as Document & { [key: symbol]: WordLabelsState | undefined };
  const existing = owner[options.stateKey];
  if (existing) {
    existing.refresh(doc);
    return existing;
  }

  const collect = (root: Node, labels: Set<HTMLElement>) => {
    const element = root.nodeType === 1 ? (root as HTMLElement) : root.parentElement;
    const owner = element?.closest<HTMLElement>(options.selector);
    if (owner) labels.add(owner);
    if (root.nodeType === 1 || root.nodeType === 9) {
      (root as Element | Document)
        .querySelectorAll<HTMLElement>(options.selector)
        .forEach((label) => labels.add(label));
    }
  };
  const refresh = (root: Node) => {
    const labels = new Set<HTMLElement>();
    collect(root, labels);
    labels.forEach((label) => splitWordLabel(label, options));
  };
  const observer = new MutationObserver((records) => {
    const labels = new Set<HTMLElement>();
    for (const record of records) {
      const target = record.target;
      const element = target.nodeType === 1 ? (target as HTMLElement) : target.parentElement;
      const label = element?.closest<HTMLElement>(options.selector);
      if (label) labels.add(label);
      record.addedNodes.forEach((node) => collect(node, labels));
    }
    labels.forEach((label) => {
      if (label.isConnected) splitWordLabel(label, options);
    });
  });
  const state = { refresh, observer };
  owner[options.stateKey] = state;
  refresh(doc);
  observer.observe(doc, { childList: true, characterData: true, subtree: true });
  return state;
}
