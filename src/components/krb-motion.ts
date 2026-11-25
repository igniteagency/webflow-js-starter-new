import type { Flip as FlipPlugin } from 'gsap/Flip';
import { splitText, type TextSplit } from 'kugiri';

const GSAP_CDN = 'https://cdn.prod.website-files.com/gsap/3.15.0/';
const IMAGE_SELECTOR =
  '.image-wrapper:has(> .image-clip > .image > img), .blog_image-wrapper:has(img), .post-header_media:has(> img)';
const FULL_IMAGE_SELECTOR =
  '.post-header_media:has(> img), .section_full-image .image-wrapper, .section_media-spread[data-wf--section-media-spread--variant="feature-with-pair"] .media-spread_primary > .image-wrapper, .section_content-section .content-section_layout:not(.w-variant-145102da-d2c7-fe63-d84b-36178f62d532):not(.w-variant-1455e40b-28f4-b80f-3eeb-90291432c808) > .image-wrapper';
const HERO_SELECTOR = '.section_hero .image-wrapper';
const INTRO_SELECTOR = '.intro_statement-text';
const HEADING_SELECTOR =
  ':is(.section_pathways, .section_full-image, .section_media-spread, .section_intro, .section_news, .section_cta, .section_content-section, .section_academic-results) h2.heading';
const HERO_HEADING_SELECTOR = '.section_hero .hero_heading h1';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const compact = () => matchMedia('(max-width: 767px)').matches;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const nativeScroll = () => CSS.supports('animation-timeline: view()');
const nativeReveal = () => CSS.supports('animation-trigger: --krb-reveal play-once');
const isDesigner = () =>
  Boolean((window.Webflow as { env?: (mode: string) => boolean })?.env?.('design'));
type MotionWindow = Window & { Flip?: typeof FlipPlugin };

export function imageRole(image: HTMLElement) {
  if (image.closest('.section_film-reveal, .section_history-timeline, dialog')) return 'none';
  if (image.matches(HERO_SELECTOR)) return 'hero';
  if (image.matches(FULL_IMAGE_SELECTOR)) return 'full';
  return image.matches('.blog_image-wrapper') || image.parentElement?.matches('.card_item')
    ? 'card'
    : 'standalone';
}

export function scrollValues(
  role: string,
  top: number,
  height: number,
  viewport: number,
  mobile: boolean,
  photoHeight = height
) {
  const progress = clamp((viewport - top) / (viewport + height));
  const eased = progress * progress * (3 - 2 * progress);
  const distance =
    photoHeight * (role === 'standalone' ? (mobile ? 0.01 : 0.02) : mobile ? 0.045 : 0.09);
  return {
    translate: role === 'hero' ? clamp(-top / height) * distance : (progress * 2 - 1) * distance,
    scale: role === 'full' ? 1 + (mobile ? 0.07 : 0.12) * (1 - eased) : 1,
  };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const coordinate = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return (progress: number) => {
    let low = 0,
      high = 1,
      t = progress;
    for (let i = 0; i < 14; i++) {
      if (coordinate(t, x1, x2) < progress) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return coordinate(t, y1, y2);
  };
}

const pendingLibraries = new Map<string, Promise<void>>();
function library(name: string) {
  const available = () => Boolean((window as unknown as Record<string, unknown>)[name]);
  if (available()) return Promise.resolve();
  let pending = pendingLibraries.get(name);
  if (!pending) {
    pending = (async () => {
      if (typeof window.loadScript !== 'function')
        throw new Error('KRB motion requires the project loader.');
      await window.loadScript(`${GSAP_CDN}${name}.min.js`, {
        placement: 'head',
        name: `krb-${name}`,
      });
      // The shared loader resolves early when Webflow has already inserted the same script.
      const deadline = performance.now() + 1800;
      while (!available() && performance.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 25));
      if (!available()) throw new Error(`${name} did not become available.`);
    })();
    pendingLibraries.set(name, pending);
  }
  return pending;
}
async function plugins(names: string[]) {
  await library('gsap');
  await Promise.all(names.map(library));
  gsap.registerPlugin(...names.map((name) => (window as unknown as Record<string, object>)[name]));
}

export function initImageFallbacks() {
  const images = [...document.querySelectorAll<HTMLElement>(IMAGE_SELECTOR)];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const { signal } = controller;
  const pending = new Set<HTMLElement>();
  const pendingTriggers = new Set<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  const show = (image: HTMLElement) => {
    image.dataset.motionReveal = 'visible';
    pending.delete(image);
    observer?.unobserve(image);
  };
  const showTrigger = (element: HTMLElement) => {
    element.dataset.motionTrigger = 'visible';
    pendingTriggers.delete(element);
    observer?.unobserve(element);
  };
  const settle = () => {
    pending.forEach(show);
    pendingTriggers.forEach(showTrigger);
    images.forEach((image) => {
      image.style.removeProperty('--krb-parallax');
      image.style.removeProperty('--krb-image-scale');
      delete image.dataset.motionScroll;
    });
  };
  if (!motion.matches && !nativeReveal() && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
            const target = entry.target as HTMLElement;
            if (pendingTriggers.has(target)) showTrigger(target);
            else show(target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0 }
    );
    images
      .filter((image) => ['card', 'standalone'].includes(imageRole(image)))
      .forEach((image) => {
        // Never hide content already visible on a restored position or a deep link.
        if (image.getBoundingClientRect().top < innerHeight) return;
        image.dataset.motionReveal = 'pending';
        pending.add(image);
        observer?.observe(image);
      });
    document
      .querySelectorAll<HTMLElement>('.divider, .card_item, .sacred-heart-network_art')
      .forEach((element) => {
        if (
          element.closest('.section_history-timeline, dialog, .w-condition-invisible') ||
          element.getBoundingClientRect().top < innerHeight
        )
          return;
        pendingTriggers.add(element);
        observer?.observe(element);
      });
  }
  let frame = 0;
  const scrollImages = nativeScroll()
    ? []
    : images.filter((image) => ['hero', 'full', 'standalone'].includes(imageRole(image)));
  const paint = () => {
    frame = 0;
    if (motion.matches) return;
    scrollImages.forEach((image) => {
      const bounds = image.getBoundingClientRect();
      if (!bounds.height || bounds.bottom < -innerHeight || bounds.top > innerHeight * 2) return;
      const role = imageRole(image);
      const photoHeight =
        image.querySelector<HTMLElement>(':scope > .image-clip')?.getBoundingClientRect().height ||
        bounds.height;
      const values = scrollValues(
        role,
        bounds.top,
        bounds.height,
        innerHeight,
        compact(),
        photoHeight
      );
      image.dataset.motionScroll = 'fallback';
      image.style.setProperty('--krb-parallax', `${values.translate.toFixed(2)}px`);
      if (role !== 'hero') image.style.setProperty('--krb-image-scale', values.scale.toFixed(5));
    });
    pending.forEach((image) => {
      if (image.getBoundingClientRect().bottom < 0) show(image);
    });
    pendingTriggers.forEach((element) => {
      if (element.getBoundingClientRect().bottom < 0) showTrigger(element);
    });
  };
  const schedule = () => {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  };
  if (scrollImages.length || pending.size || pendingTriggers.size) {
    addEventListener('scroll', schedule, { passive: true, signal });
    addEventListener('resize', schedule, { passive: true, signal });
  }
  document.addEventListener(
    'focusin',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      pending.forEach((image) => {
        if ((image.closest('.card_item') || image).contains(target)) show(image);
      });
      pendingTriggers.forEach((element) => {
        if (element.contains(target)) showTrigger(element);
      });
    },
    { signal }
  );
  motion.addEventListener(
    'change',
    () => {
      if (motion.matches) settle();
      else schedule();
    },
    { signal }
  );
  addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted) {
        pending.forEach(show);
        pendingTriggers.forEach(showTrigger);
        schedule();
      }
    },
    { signal }
  );
  addEventListener('beforeprint', settle, { signal });
  addEventListener('afterprint', schedule, { signal });
  addEventListener(
    'pagehide',
    (event) => {
      settle();
      cancelAnimationFrame(frame);
      frame = 0;
      if (!event.persisted) {
        observer?.disconnect();
        controller.abort();
      }
    },
    { signal }
  );
  paint();
}

/** Preserve the browser's line layout and the reveal's elapsed time on reflow. */
export function splitLines(
  element: HTMLElement,
  animate: (split: TextSplit) => gsap.core.Tween,
  failOpen: () => void
) {
  const originalStyle = element.getAttribute('style');
  const controller = new AbortController();
  let split: TextSplit | undefined;
  let tween: gsap.core.Tween | undefined;
  let frame = 0;
  let disposed = false;
  let width = element.getBoundingClientRect().width;
  const restoreStyle = () => {
    if (originalStyle === null) element.removeAttribute('style');
    else element.setAttribute('style', originalStyle);
  };
  const revert = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    controller.abort();
    tween?.kill();
    split?.revert();
    restoreStyle();
  };
  const rebuild = () => {
    const elapsed = tween?.totalTime() ?? 0;
    const paused = tween?.paused() ?? true;
    const replacing = !!tween;
    tween?.kill();
    split?.revert();
    restoreStyle();
    split = splitText(element, {
      type: ['lines'],
      mask: { lines: '.15em' },
      classes: { lines: 'krb-motion-line', mask: 'krb-motion-line-mask' },
    });
    tween = animate(split);
    if (replacing) tween.totalTime(elapsed).paused(paused);
  };
  const schedule = () => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      try {
        rebuild();
      } catch (error) {
        revert();
        failOpen();
        console.error('KRB text reflow skipped; native text remains visible.', error);
      }
    });
  };
  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          const nextWidth = element.getBoundingClientRect().width;
          if (Math.abs(nextWidth - width) < 0.5) return;
          width = nextWidth;
          schedule();
        });
  try {
    rebuild();
    observer?.observe(element);
    document.fonts?.addEventListener('loadingdone', schedule, { signal: controller.signal });
  } catch (error) {
    revert();
    throw error;
  }
  return { revert };
}

function initText(statement: HTMLElement, kind: 'intro' | 'heading' = 'intro') {
  if (statement.dataset.krbMotion || statement.querySelector('a,button,input') || reduced()) return;
  statement.dataset.krbMotion = kind;
  const original = statement.innerHTML;
  const phrases = statement.textContent?.match(/[^.!?,;]+[.!?,;]?\s*/g) || [];
  if (kind === 'intro')
    statement.replaceChildren(
      ...phrases.map((text, index) => {
        const span = document.createElement('span');
        span.className = 'krb-motion-phrase';
        span.dataset.motionPhrase = String(index);
        span.textContent = text;
        return span;
      })
    );
  let revealed = statement.getBoundingClientRect().bottom <= 0;
  let entrance: gsap.core.Tween | undefined;
  let colour: gsap.core.Tween | undefined;
  let split: ReturnType<typeof splitLines> | undefined;
  let observer: IntersectionObserver | undefined;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const { signal } = controller;
  const restore = () => {
    observer?.disconnect();
    entrance?.kill();
    colour?.scrollTrigger?.kill();
    colour?.kill();
    split?.revert();
    statement.innerHTML = original;
    delete statement.dataset.krbMotion;
    controller.abort();
  };
  try {
    split = splitLines(
      statement,
      (self) => {
        colour?.scrollTrigger?.kill();
        colour?.kill();
        const parts = statement.querySelectorAll<HTMLElement>('.krb-motion-phrase');
        if (kind === 'intro')
          colour = gsap.fromTo(
            parts,
            { opacity: 0.72 },
            {
              opacity: 1,
              duration: 1,
              ease: 'none',
              stagger: (_index, element) => Number((element as HTMLElement).dataset.motionPhrase),
              scrollTrigger: {
                trigger: statement,
                start: 'top 78%',
                end: 'bottom 60%',
                scrub: true,
              },
            }
          );
        entrance = gsap.from(self.lines, {
          yPercent: revealed ? 0 : 110,
          duration: revealed ? 0 : compact() ? 0.58 : 0.8,
          stagger: (index) =>
            Math.min(index * (compact() ? 0.035 : 0.065), compact() ? 0.12 : 0.22),
          ease: cubicBezier(0.22, 1, 0.36, 1),
          paused: !revealed,
          onComplete: () => {
            revealed = true;
          },
        });
        colour?.scrollTrigger?.refresh();
        return entrance;
      },
      restore
    );
    const reveal = () => {
      entrance?.play();
      observer?.disconnect();
    };
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) reveal();
        },
        { rootMargin: '0px 0px -8% 0px' }
      );
      observer.observe(statement);
    } else reveal();
    motion.addEventListener(
      'change',
      () => {
        if (motion.matches) restore();
      },
      { signal }
    );
    addEventListener('beforeprint', restore, { signal });
    addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) {
          revealed = true;
          entrance?.progress(1);
        }
      },
      { signal }
    );
    document.addEventListener(
      'focusin',
      (event) => {
        if (event.target instanceof Node && statement.contains(event.target)) reveal();
      },
      { signal }
    );
  } catch (error) {
    restore();
    console.error('KRB intro motion could not initialise.', error);
  }
}

function crestBounds() {
  const crest = document.querySelector('.navbar_component .logo_crest svg');
  const crestRect = crest?.getBoundingClientRect();
  if (crestRect?.width && crestRect.height) {
    const path = crest?.querySelector('path[fill]');
    return {
      left: crestRect.left,
      top: crestRect.top,
      width: crestRect.width,
      height: crestRect.height,
      color: path ? getComputedStyle(path).fill : undefined,
    };
  }
  const logo = document.querySelector('.navbar_component .logo_primary svg');
  const rect = logo?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return;
  const unit = Math.min(rect.width / 293.691589, rect.height / 158.442703);
  return {
    left: rect.left + (rect.width - 293.691589 * unit) / 2 + 102.685425 * unit,
    top: rect.top + (rect.height - 158.442703 * unit) / 2,
    width: 88.320129 * unit,
    height: 101.798691 * unit,
    color: (() => {
      const path = logo?.querySelector('[fill*="--_theme---accent"]');
      return path ? getComputedStyle(path).fill : undefined;
    })(),
  };
}

function entranceEligible() {
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  return (
    !location.hash &&
    scrollY <= 8 &&
    !document.hidden &&
    !reduced() &&
    navigation?.type !== 'back_forward'
  );
}

export function openingEligible() {
  return location.pathname === '/' && entranceEligible();
}

function prepareOpening() {
  const root = document.documentElement;
  let finished = false;
  let sequence: gsap.core.Timeline | undefined;
  let crest: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let crestStyle: string | null = null;
  let panelStyle: string | null = null;
  const controller = new AbortController();
  const { signal } = controller;
  const hero = (settled = false) => {
    root.dataset.krbHero = settled ? 'settled' : 'ready';
  };
  const finish = (interrupted = true) => {
    if (finished) return;
    finished = true;
    sequence?.kill();
    delete root.dataset.krbOpening;
    hero(interrupted);
    if (crest) {
      if (crestStyle === null) crest.removeAttribute('style');
      else crest.setAttribute('style', crestStyle);
    }
    if (panel) {
      if (panelStyle === null) panel.removeAttribute('style');
      else panel.setAttribute('style', panelStyle);
    }
    clearTimeout(timeout);
    controller.abort();
  };
  let timeout = setTimeout(() => finish(), 3200);
  if (!openingEligible() || isDesigner()) {
    finish(!entranceEligible() || isDesigner());
    return { play: async () => {} };
  }
  root.dataset.krbOpening = 'pending';
  root.dataset.krbHero = 'pending';
  for (const event of ['pagehide', 'wheel', 'touchstart', 'pointerdown', 'keydown']) {
    addEventListener(event, () => finish(), { passive: true, signal });
  }
  addEventListener(
    'resize',
    () => {
      if (sequence) finish();
    },
    { passive: true, signal }
  );
  document.addEventListener('focusin', () => finish(), { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) finish();
    },
    { signal }
  );
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => finish(), {
    signal,
  });
  return {
    async play() {
      if (finished) return;
      panel = document.querySelector<HTMLElement>('.opening_panel');
      crest = document.querySelector<HTMLElement>('.opening_crest');
      crestStyle = crest?.getAttribute('style') ?? null;
      panelStyle = panel?.getAttribute('style') ?? null;
      if (!panel || !crest || !openingEligible() || isDesigner()) {
        finish();
        return;
      }
      crestStyle = crest.getAttribute('style');
      panelStyle = panel.getAttribute('style');
      try {
        await plugins(['Flip']);
        if (finished) return;
        const destination = crestBounds();
        const Flip = (window as MotionWindow).Flip;
        if (!destination || !Flip) {
          finish();
          return;
        }
        clearTimeout(timeout);
        timeout = setTimeout(() => finish(), 2600);
        root.dataset.krbOpening = 'running';
        const initial = crest.getBoundingClientRect();
        crest.style.translate = 'none';
        gsap.set(crest, {
          left: initial.left,
          top: initial.top,
          width: initial.width,
          height: initial.height,
          x: 0,
          y: 0,
          xPercent: 0,
          yPercent: 0,
        });
        const state = Flip.getState(crest);
        gsap.set(crest, {
          left: destination.left,
          top: destination.top,
          width: destination.width,
          height: destination.height,
          x: 0,
          y: 0,
          xPercent: 0,
          yPercent: 0,
        });
        const ease = cubicBezier(0.65, 0, 0.25, 1);
        const travel = Flip.from(state, { duration: 1.45, ease, scale: true, paused: true });
        sequence = gsap
          .timeline({ onComplete: () => finish(false) })
          .to(panel, { yPercent: -100, duration: 1.6, ease }, 0.35)
          .add(travel.play(), 0.35)
          .call(() => hero(), [], 0.85);
        if (destination.color)
          sequence.to(
            crest,
            { color: destination.color, duration: 0.45, ease: 'power1.inOut' },
            1.35
          );
      } catch (error) {
        finish();
        console.error('KRB opening motion could not initialise.', error);
      }
    },
  };
}

type HeroEntranceOptions = {
  eligible: () => boolean;
  designer: () => boolean;
  plugins: () => Promise<void>;
  split?: typeof splitLines;
};

/** The opening owns the image/crest; this controller owns only Hero copy. */
export function prepareHeroEntrance({
  eligible,
  designer,
  plugins,
  split: createSplit = splitLines,
}: HeroEntranceOptions) {
  const root = document.documentElement;
  const controller = new AbortController();
  const { signal } = controller;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const tweens = new Set<gsap.core.Tween>();
  const splits: ReturnType<typeof splitLines>[] = [];
  const headings: HTMLElement[] = [];
  const unfinished = new Set<HTMLElement>();
  let settled = false;
  let prepared = false;
  let started = false;
  let observer: MutationObserver | undefined;
  let cancelFontWait = () => {};
  let timeout: ReturnType<typeof setTimeout>;

  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    cancelFontWait();
    observer?.disconnect();
    // Restore native content and authored inline styles after playback.
    splits.forEach((split) => split.revert());
    tweens.forEach((tween) => tween.revert());
    headings.forEach((heading) => delete heading.dataset.krbMotion);
    delete root.dataset.krbHeroCopy;
    controller.abort();
  };
  const complete = (element: HTMLElement) => {
    unfinished.delete(element);
    if (started && !unfinished.size) queueMicrotask(finish);
  };
  const start = () => {
    if (settled || started || !prepared) return;
    if (root.dataset.krbHero === 'settled' || !eligible() || designer()) {
      finish();
      return;
    }
    if (root.dataset.krbHero !== 'ready') return;
    started = true;
    root.dataset.krbHeroCopy = 'running';
    clearTimeout(timeout);
    timeout = setTimeout(finish, 2000);
    tweens.forEach((tween) => tween.play());
    if (!unfinished.size) finish();
  };

  if (!eligible() || designer()) settled = true;
  else {
    root.dataset.krbHeroCopy = 'pending';
    timeout = setTimeout(finish, 3200);
    for (const event of [
      'pagehide',
      'beforeprint',
      'wheel',
      'touchstart',
      'pointerdown',
      'keydown',
    ])
      addEventListener(event, finish, { passive: true, signal });
    addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) finish();
      },
      { signal }
    );
    addEventListener(
      'scroll',
      () => {
        if (scrollY > 8) finish();
      },
      { passive: true, signal }
    );
    document.addEventListener('focusin', finish, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) finish();
      },
      { signal }
    );
    motion.addEventListener(
      'change',
      () => {
        if (motion.matches) finish();
      },
      { signal }
    );
  }

  const fontsReady = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 800);
      cancelFontWait = () => {
        clearTimeout(timer);
        resolve();
      };
      void document.fonts.ready.then(cancelFontWait, cancelFontWait);
    });

  return {
    finish,
    async init() {
      if (settled) return;
      if (!eligible() || designer()) {
        finish();
        return;
      }
      const copies = [...document.querySelectorAll<HTMLElement>('.section_hero .hero_copy')];
      if (!copies.length) {
        finish();
        return;
      }
      observer = new MutationObserver(() => {
        if (root.dataset.krbHero === 'settled') finish();
        else start();
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-krb-hero'] });
      try {
        await Promise.all([plugins(), fontsReady()]);
        if (settled) return;
        if (!eligible() || designer()) {
          finish();
          return;
        }
        const compact = matchMedia('(max-width: 767px)').matches;
        // GSAP accepts an easing function; keep the same curve as the Astro reveal.
        const easing = cubicBezier(0.22, 1, 0.36, 1);
        for (const copy of copies) {
          const heading = copy.querySelector<HTMLElement>('.hero_heading h1');
          const children = [...copy.children].filter(
            (element): element is HTMLElement =>
              element instanceof HTMLElement &&
              element.getClientRects().length > 0 &&
              getComputedStyle(element).display !== 'none' &&
              !element.classList.contains('w-condition-invisible')
          );
          let afterTitle = false;
          for (const element of children) {
            if (heading && element.contains(heading)) {
              afterTitle = true;
              unfinished.add(heading);
              heading.dataset.krbMotion = 'hero';
              headings.push(heading);
              let completed = false;
              let entrance: gsap.core.Tween | undefined;
              const animate = (targets: HTMLElement[], splitLines: boolean) => {
                if (entrance) tweens.delete(entrance);
                entrance = gsap.fromTo(
                  targets,
                  {
                    opacity: completed ? 1 : 0,
                    yPercent: splitLines && !completed ? 110 : 0,
                    y: !splitLines && !completed ? (compact ? 10 : 16) : 0,
                  },
                  {
                    opacity: 1,
                    yPercent: 0,
                    y: 0,
                    duration: completed ? 0 : compact ? 0.58 : 0.8,
                    delay: completed ? 0 : compact ? 0.063 : 0.09,
                    stagger: (index) =>
                      completed
                        ? 0
                        : Math.min(index * (compact ? 0.035 : 0.065), compact ? 0.12 : 0.22),
                    ease: easing,
                    paused: !started,
                    onComplete: () => {
                      completed = true;
                      complete(heading);
                    },
                  }
                );
                tweens.add(entrance);
                return entrance;
              };
              if (document.fonts.status === 'loaded') {
                splits.push(
                  createSplit(heading, (self) => animate(self.lines as HTMLElement[], true), finish)
                );
              } else animate([heading], false);
            } else {
              unfinished.add(element);
              const tween = gsap.fromTo(
                element,
                { opacity: 0, y: compact ? 10 : 16 },
                {
                  opacity: 1,
                  y: 0,
                  duration: compact ? 0.48 : 0.62,
                  delay: afterTitle ? (compact ? 0.112 : 0.16) : 0,
                  ease: easing,
                  paused: true,
                  onComplete: () => complete(element),
                }
              );
              tweens.add(tween);
            }
          }
        }
        prepared = true;
        start();
      } catch (error) {
        finish();
        console.error(
          'KRB Hero entrance could not initialise; native content remains visible.',
          error
        );
      }
    },
  };
}

if (typeof document !== 'undefined') {
  const opening = prepareOpening();
  const heroEntrance = prepareHeroEntrance({
    eligible: entranceEligible,
    designer: isDesigner,
    plugins: () => plugins([]),
  });
  const init = () => {
    if (isDesigner()) {
      heroEntrance.finish();
      return;
    }
    document.querySelectorAll<HTMLElement>('.section_intro[data-reveal]').forEach((section) => {
      section.dataset.krbOriginalReveal = section.getAttribute('data-reveal') || '';
      section.removeAttribute('data-reveal');
    });
    initImageFallbacks();
    void opening.play();
    void heroEntrance.init();
    if (
      !reduced() &&
      document.querySelector(`${INTRO_SELECTOR},${HEADING_SELECTOR},${HERO_HEADING_SELECTOR}`)
    ) {
      void plugins(['ScrollTrigger'])
        .then(async () => {
          await document.fonts.ready;
          if (reduced()) return;
          document
            .querySelectorAll<HTMLElement>(INTRO_SELECTOR)
            .forEach((element) => initText(element));
          document
            .querySelectorAll<HTMLElement>(HEADING_SELECTOR)
            .forEach((element) => initText(element, 'heading'));
        })
        .catch((error) =>
          console.error('KRB intro plugins could not load; native text remains visible.', error)
        );
    }
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
