const SECTION_SELECTOR = '.section_scroll-sequence';
const ENHANCED_MEDIA =
  '(min-width: 992px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';
const REQUIRED_CSS = [
  'grid-row: 1 / span sibling-count()',
  'z-index: sibling-index()',
  'grid-template-rows: subgrid',
  'timeline-scope: --krb-ss-step',
  'animation-timeline: --krb-ss-step',
  'view-timeline-inset: 45% 45%',
  'animation-range: entry 0% exit 100%',
];

type Pair = { item: HTMLElement; figure: HTMLElement; copy: HTMLElement };

export function initScrollSequence(root: HTMLElement) {
  if (root.dataset.scrollSequenceRuntimeReady === 'true') return;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view || doc.documentElement.classList.contains('wf-design-mode')) return;
  const webflow = view.Webflow as { env?: (mode: string) => boolean } | undefined;
  if (webflow?.env?.('design')) return;
  if (!REQUIRED_CSS.every((rule) => view.CSS?.supports(rule))) return;

  const steps = Array.from(root.querySelectorAll<HTMLElement>('.scroll-sequence_steps')).find(
    (element) => element.closest(SECTION_SELECTOR) === root
  );
  if (!steps) return;
  const media = view.matchMedia(ENHANCED_MEDIA);
  const originals = new Map<HTMLElement, Map<string, string | null>>();
  let pairs: Pair[] = [];
  let timed = false;
  let frame = 0;
  let measurePending = false;
  let preloaded = false;
  let observed: HTMLElement[] = [];

  const remember = (element: HTMLElement, names: string[]) => {
    if (!originals.has(element)) {
      originals.set(element, new Map(names.map((name) => [name, element.getAttribute(name)])));
    }
  };
  const restore = () => {
    originals.forEach((attributes, element) => {
      attributes.forEach((value, name) => {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      });
    });
  };
  const collect = () => {
    const children = Array.from(steps.children);
    if (
      !children.length ||
      children.some(
        (item) =>
          !item.classList.contains('scroll-sequence_item') ||
          item.matches('[hidden], .w-condition-invisible')
      )
    ) {
      return [];
    }
    const next: Pair[] = [];
    for (const item of children as HTMLElement[]) {
      const figure = item.querySelector<HTMLElement>(':scope > .image-wrapper');
      const copy = item.querySelector<HTMLElement>(':scope > .heading-lockup');
      if (!figure || !copy) return [];
      remember(item, ['data-scroll-sequence-active', 'aria-current']);
      remember(figure, ['aria-hidden', 'inert']);
      next.push({ item, figure, copy });
    }
    return next;
  };
  const preload = () => {
    preloaded = true;
    pairs.forEach(({ figure }) => {
      figure.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
        image.loading = 'eager';
      });
    });
  };
  const clear = () => {
    timed = false;
    root.removeAttribute('data-scroll-sequence-motion');
    root.removeAttribute('data-scroll-sequence-spacing');
    restore();
  };
  const update = () => {
    if (!timed || !pairs.length) return;
    const line = view.innerHeight / 2;
    let active = 0;
    let distance = Infinity;
    pairs.forEach(({ copy }, index) => {
      const rect = copy.getBoundingClientRect();
      const next = Math.abs(rect.top + rect.height / 2 - line);
      if (next < distance) {
        distance = next;
        active = index;
      }
    });
    pairs.forEach(({ item, figure }, index) => {
      const selected = index === active;
      if (selected) {
        item.setAttribute('data-scroll-sequence-active', 'true');
        item.setAttribute('aria-current', 'step');
      } else {
        item.removeAttribute('data-scroll-sequence-active');
        item.removeAttribute('aria-current');
      }
      figure.setAttribute('aria-hidden', String(!selected));
      figure.toggleAttribute('inert', !selected);
    });
  };
  const resizeObserver = view.ResizeObserver
    ? new view.ResizeObserver(() => schedule(true))
    : undefined;
  const observeContent = () => {
    const header = doc.querySelector<HTMLElement>(
      '.section_navbar .navbar_component, .section_navbar'
    );
    const targets = pairs.flatMap(({ copy, figure }) => [
      ...(Array.from(copy.children) as HTMLElement[]),
      ...Array.from(figure.querySelectorAll<HTMLElement>('.image-clip, figcaption')),
    ]);
    if (header) targets.push(header);
    if (
      targets.length === observed.length &&
      targets.every((target, i) => target === observed[i])
    ) {
      return;
    }
    resizeObserver?.disconnect();
    targets.forEach((target) => resizeObserver?.observe(target));
    observed = targets;
  };
  const measure = () => {
    pairs = collect();
    if (!media.matches || root.dataset.scrollSequenceDisplay === 'stacked' || !pairs.length) {
      clear();
      return;
    }
    // Compact forces intrinsic row heights even when the CSS-only short-screen fallback is flow.
    root.dataset.scrollSequenceSpacing = 'compact';
    root.removeAttribute('data-scroll-sequence-motion');
    const header =
      doc.querySelector<HTMLElement>('.section_navbar .navbar_component') ||
      doc.querySelector<HTMLElement>('.section_navbar');
    const available = view.innerHeight - (header?.offsetHeight || 90) - 48;
    const copyHeight = pairs.reduce(
      (height, { copy }) => height + copy.getBoundingClientRect().height,
      0
    );
    const imageHeight = Math.max(
      ...pairs.map(({ figure }) => figure.getBoundingClientRect().height)
    );
    timed = Math.max(copyHeight, imageHeight) > available;
    root.dataset.scrollSequenceSpacing = timed ? 'flow' : 'compact';
    if (timed) {
      update();
      root.dataset.scrollSequenceMotion = 'timed';
    } else {
      restore();
    }
    observeContent();
    if (preloaded) preload();
  };
  function schedule(needsMeasure = false) {
    measurePending ||= needsMeasure;
    if (frame) return;
    frame = view!.requestAnimationFrame(() => {
      frame = 0;
      const shouldMeasure = measurePending;
      measurePending = false;
      if (shouldMeasure) measure();
      else update();
    });
  }

  root.dataset.scrollSequenceRuntimeReady = 'true';
  measure();
  media.addEventListener('change', () => schedule(true));
  view.addEventListener('scroll', () => schedule(), { passive: true });
  view.addEventListener('resize', () => schedule(true), { passive: true });
  view.addEventListener('pageshow', () => schedule(true));
  root.addEventListener('load', () => schedule(true), true);
  doc.fonts?.ready.then(() => schedule(true));
  if (view.MutationObserver) {
    new view.MutationObserver(() => schedule(true)).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'src',
        'srcset',
        'sizes',
        'hidden',
        'class',
        'data-scroll-sequence-display',
      ],
    });
  }
  if (view.IntersectionObserver) {
    const observer = new view.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        preload();
        observer.disconnect();
      },
      { rootMargin: '600px' }
    );
    observer.observe(root);
  }
}

export function initScrollSequences(context: ParentNode = document) {
  context.querySelectorAll<HTMLElement>(SECTION_SELECTOR).forEach(initScrollSequence);
}

if (typeof document !== 'undefined') {
  const init = () => initScrollSequences();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
