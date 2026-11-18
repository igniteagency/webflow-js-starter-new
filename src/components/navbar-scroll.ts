const OVER_IMAGE_VARIANT = 'w-variant-c2b11e66-d188-230c-b59f-a13396f30144';
const TOP_ZONE = 48;
const DIRECTION_THRESHOLD = 10;

export function initNavbarScroll(root: HTMLElement) {
  if (root.dataset.navbarScrollReady) return;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view || doc.documentElement.classList.contains('wf-design-mode')) return;

  const parts = [root, ...root.querySelectorAll<HTMLElement>('[data-navbar-scroll-part]')];
  const hero = doc.querySelector<HTMLElement>('[data-navbar-scroll-hero]');
  const panel = root.querySelector<HTMLElement>('[popover]');
  let boundary = 0;
  let directionAnchor = view.scrollY;
  let lastY = directionAnchor;
  let direction = 0;
  let hidden = false;
  let compact: boolean | undefined;
  let pending = false;

  const position = () => Math.max(0, Math.min(view.scrollY,
    Math.max(0, doc.documentElement.scrollHeight - view.innerHeight)));

  function render() {
    const y = position();
    const nextCompact = !hero || y >= boundary;
    if (compact !== nextCompact) {
      compact = nextCompact;
      for (const part of parts) part.classList.toggle(OVER_IMAGE_VARIANT, !compact);
      root.setAttribute('data-wf--section-navbar--variant', compact ? 'solid' : 'over-image');
    }
    if (y <= TOP_ZONE || panel?.matches(':popover-open') || root.querySelector(':focus-visible')) {
      hidden = false;
      directionAnchor = y;
    }
    root.dataset.navbarScrollHidden = String(hidden);
  }

  function measure() {
    const compactHeight = view.matchMedia('(max-width: 991px)').matches ? 80 : 84;
    boundary = hero ? hero.getBoundingClientRect().bottom + view.scrollY - compactHeight : 0;
    render();
  }

  function onScroll() {
    if (pending) return;
    pending = true;
    view.requestAnimationFrame(() => {
      pending = false;
      const y = position();
      const nextDirection = Math.sign(y - lastY);
      if (nextDirection && nextDirection !== direction) {
        direction = nextDirection;
        directionAnchor = lastY;
      }
      if (Math.abs(y - directionAnchor) >= DIRECTION_THRESHOLD) {
        hidden = direction > 0 && y > TOP_ZONE;
        directionAnchor = y;
      }
      lastY = y;
      render();
    });
  }

  root.dataset.navbarScrollReady = 'true';
  measure();
  view.addEventListener('scroll', onScroll, { passive: true });
  view.addEventListener('resize', measure, { passive: true });
  view.addEventListener('pageshow', measure);
  root.addEventListener('focusin', render);
  root.addEventListener('focusout', () => view.requestAnimationFrame(render));
  panel?.addEventListener('toggle', render);
  if (hero && view.ResizeObserver) new view.ResizeObserver(measure).observe(hero);
  doc.fonts?.ready.then(measure);
}

if (typeof document !== 'undefined') {
  const init = () => document.querySelectorAll<HTMLElement>('[data-navbar-scroll]')
    .forEach(initNavbarScroll);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
