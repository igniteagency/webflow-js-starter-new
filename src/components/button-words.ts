import { initWordLabels, splitWordLabel } from '../utils/word-labels';

const OPTIONS = {
  selector: '.button_component [data-el="button-word-label"]',
  wordClass: 'button_word',
  textClass: 'button_word-text',
  stateKey: Symbol.for('webflow.button-words'),
};

export function splitButtonLabel(label: HTMLElement) {
  splitWordLabel(label, OPTIONS);
}

export function initButtonWords(doc: Document = document) {
  return initWordLabels(doc, OPTIONS);
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initButtonWords());
}
