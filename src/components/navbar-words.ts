import { initWordLabels, splitWordLabel } from '../utils/word-labels';

const OPTIONS = {
  selector: '[data-navbar-menu] [data-el="navbar-word-label"]',
  wordClass: 'navbar_word',
  textClass: 'navbar_word-text',
  indexProperty: '--word-index',
  stateKey: Symbol.for('webflow.navbar-words'),
};

export function splitNavbarLabel(label: HTMLElement) {
  splitWordLabel(label, OPTIONS);
}

export function initNavbarWords(doc: Document = document) {
  return initWordLabels(doc, OPTIONS);
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initNavbarWords());
}
