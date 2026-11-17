const LIGHTBOX_TEMPLATE_SELECTOR = '[data-lightbox-template], [data-newsletter-lightbox-template]';
const HISTORY_TIMELINE_SELECTOR =
  '[data-history-timeline="component"], .history-timeline_component';
const LIGHTBOX_CSS_ID = 'krb-lightbox-css';
const IMAGE_EXT_PATTERN = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;

type LightboxItem = {
  img: HTMLImageElement;
  src: string;
  alt: string;
  caption: string;
};

type LightboxGalleryOptions = {
  root: HTMLElement;
  imagesSelector?: string;
  template?: HTMLElement | null;
  label?: string;
  initialisedKey?: string;
  imageIndexAttribute?: string;
  overlayAttribute?: string;
  bodyOpenClass?: string;
  triggerImages?: boolean;
};

export function initLightboxGallery(options: LightboxGalleryOptions) {
  const {
    root,
    imagesSelector = 'img',
    template = getTemplate(root),
    label = 'Image gallery',
    initialisedKey = 'lightboxInitialised',
    imageIndexAttribute = 'lightboxIndex',
    overlayAttribute = 'data-lightbox',
    bodyOpenClass = 'lightbox-open',
    triggerImages = true,
  } = options;

  if (root.dataset[initialisedKey] === 'true') return;

  const images = getUniqueImages(root, imagesSelector);
  if (!images.length) return;

  const items = images.map((img, index) => {
    img.dataset[imageIndexAttribute] = String(index);

    if (triggerImages) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute(
        'aria-label',
        `Open image ${index + 1}: ${img.alt || getImageCaption(img) || label}`
      );
    }

    return {
      img,
      src: getImageSrc(img),
      alt: img.alt || '',
      caption: getImageCaption(img),
    };
  });

  addLightboxCSS();

  const lightbox = template ? (template.cloneNode(true) as HTMLElement) : createFallbackLightbox();
  if (!(lightbox instanceof HTMLElement)) return;

  lightbox.removeAttribute('data-lightbox-template');
  lightbox.removeAttribute('data-newsletter-lightbox-template');
  lightbox.setAttribute(overlayAttribute, '');
  lightbox.setAttribute('data-history-lightbox', '');
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', label);
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.hidden = true;
  lightbox.inert = true;

  if (template) {
    lightbox.style.removeProperty('display');
  }

  document.body.appendChild(lightbox);
  bindRichTextGallery(lightbox, items, { root, bodyOpenClass, triggerImages });
  root.dataset[initialisedKey] = 'true';
}

function getUniqueImages(root: ParentNode, imagesSelector: string) {
  return Array.from(root.querySelectorAll<HTMLImageElement>(imagesSelector))
    .filter((img) => img.currentSrc || img.src)
    .filter((img, index, allImages) => allImages.indexOf(img) === index);
}

function getTemplate(root: ParentNode) {
  return root.querySelector<HTMLElement>(LIGHTBOX_TEMPLATE_SELECTOR);
}

function addLightboxCSS() {
  if (document.getElementById(LIGHTBOX_CSS_ID)) return;

  const style = document.createElement('style');
  style.id = LIGHTBOX_CSS_ID;
  style.textContent = `
    body.lightbox-open {
      overflow: hidden;
    }

    .section_history-timeline [data-lightbox-template],
    .section_history-timeline [data-newsletter-lightbox-template] {
      display: none !important;
    }

    .newsletter-lightbox,
    [data-lightbox],
    [data-newsletter-lightbox] {
      position: fixed;
      inset: 0;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
    }

    .newsletter-lightbox.is-open,
    [data-lightbox].is-open,
    [data-newsletter-lightbox].is-open {
      opacity: 1;
      pointer-events: auto;
    }

    .newsletter-lightbox__image,
    [data-lightbox-image] {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  `;
  document.head.appendChild(style);
}

function createFallbackLightbox() {
  const fallback = document.createElement('div');
  fallback.className = 'newsletter-lightbox';
  fallback.setAttribute('data-lightbox', '');
  fallback.innerHTML = `
    <button class="newsletter-lightbox__button newsletter-lightbox__close" type="button" data-lightbox-close aria-label="Close image gallery">×</button>
    <button class="newsletter-lightbox__button newsletter-lightbox__prev" type="button" data-lightbox-prev aria-label="Previous image">‹</button>
    <div class="newsletter-lightbox__stage" data-lightbox-stage>
      <img class="newsletter-lightbox__image" data-lightbox-image alt="">
    </div>
    <button class="newsletter-lightbox__button newsletter-lightbox__next" type="button" data-lightbox-next aria-label="Next image">›</button>
    <div class="newsletter-lightbox__meta">
      <p class="newsletter-lightbox__caption" data-lightbox-caption></p>
      <p class="newsletter-lightbox__counter" data-lightbox-counter></p>
    </div>
  `;

  return fallback;
}

function bindRichTextGallery(
  lightbox: HTMLElement,
  items: LightboxItem[],
  options: { root: HTMLElement; bodyOpenClass: string; triggerImages: boolean }
) {
  const imageEl =
    lightbox.querySelector<HTMLImageElement>('[data-lightbox-image]') ||
    lightbox.querySelector<HTMLImageElement>('img');
  const captionEl = lightbox.querySelector<HTMLElement>('[data-lightbox-caption]');
  const counterEls = Array.from(lightbox.querySelectorAll<HTMLElement>('[data-lightbox-counter]'));
  const paginationEls = Array.from(
    lightbox.querySelectorAll<HTMLElement>('[data-lightbox-counter], [data-lightbox-pagination]')
  );
  const closeButtons = lightbox.querySelectorAll<HTMLElement>('[data-lightbox-close]');
  const prevButtons = lightbox.querySelectorAll<HTMLElement>('[data-lightbox-prev]');
  const nextButtons = lightbox.querySelectorAll<HTMLElement>('[data-lightbox-next]');
  const stage =
    lightbox.querySelector<HTMLElement>('[data-lightbox-stage]') ||
    imageEl?.parentElement ||
    lightbox;

  if (!imageEl) {
    return { open: () => undefined, close: () => undefined };
  }

  const hasMultipleItems = items.length > 1;
  setElementsHidden([...prevButtons, ...nextButtons, ...paginationEls], !hasMultipleItems);

  let currentIndex = 0;
  let lastFocusedElement: Element | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let background: Array<{ element: HTMLElement; inert: boolean }> = [];

  const updateLightbox = () => {
    const item = items[currentIndex];
    if (!item) return;

    imageEl.src = getImageSrc(item.img);
    imageEl.alt = item.alt || item.caption || 'Image';

    if (captionEl) {
      captionEl.textContent = item.caption;
      captionEl.hidden = !item.caption;
    }

    counterEls.forEach((counterEl) => {
      counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
    });
  };

  const open = (index = 0) => {
    currentIndex = normaliseIndex(index, items.length);
    lastFocusedElement = document.activeElement;
    updateLightbox();

    background = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== lightbox
      )
      .map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => {
      element.inert = true;
    });
    lightbox.hidden = false;
    lightbox.inert = false;
    document.body.classList.add(options.bodyOpenClass);
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');

    const focusTarget =
      lightbox.querySelector<HTMLElement>('[data-lightbox-close]') ||
      lightbox.querySelector<HTMLElement>('button') ||
      lightbox;
    focusTarget.focus();
    options.root.dispatchEvent(
      new CustomEvent('history-lightbox-change', { bubbles: true, detail: true })
    );
  };

  const close = () => {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(options.bodyOpenClass);
    lightbox.hidden = true;
    lightbox.inert = true;
    background.forEach(({ element, inert }) => {
      element.inert = inert;
    });
    background = [];

    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
    options.root.dispatchEvent(
      new CustomEvent('history-lightbox-change', { bubbles: true, detail: false })
    );
  };

  const showPrevious = () => {
    if (!hasMultipleItems) return;
    currentIndex = normaliseIndex(currentIndex - 1, items.length);
    updateLightbox();
  };

  const showNext = () => {
    if (!hasMultipleItems) return;
    currentIndex = normaliseIndex(currentIndex + 1, items.length);
    updateLightbox();
  };

  if (options.triggerImages) {
    items.forEach((item, index) => {
      item.img.addEventListener('click', (event) => {
        event.preventDefault();
        open(index);
      });

      item.img.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(index);
        }
      });
    });
  }

  closeButtons.forEach((button) => button.addEventListener('click', close));
  prevButtons.forEach((button) => button.addEventListener('click', showPrevious));
  nextButtons.forEach((button) => button.addEventListener('click', showNext));

  lightbox.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const interactiveTarget = target.closest(
      '[data-lightbox-close], [data-lightbox-prev], [data-lightbox-next], [data-lightbox-image], [data-lightbox-caption], [data-lightbox-counter], [data-lightbox-pagination], button, a, img, video, iframe'
    );

    if (!interactiveTarget && lightbox.contains(target)) {
      close();
    }
  });

  stage.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );

  stage.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches[0];
      const diffX = touch.clientX - touchStartX;
      const diffY = touch.clientY - touchStartY;

      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) showPrevious();
        else showNext();
      }
    },
    { passive: true }
  );

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('is-open')) return;

    if (['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) event.preventDefault();
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') showPrevious();
    if (event.key === 'ArrowRight') showNext();
    if (event.key === 'Tab') {
      const focusable = Array.from(
        lightbox.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')
      ).filter(
        (element) =>
          !element.hidden &&
          !element.hasAttribute('disabled') &&
          element.getClientRects().length > 0
      );
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      focusable[normaliseIndex(index + (event.shiftKey ? -1 : 1), focusable.length)]?.focus();
    }
  });

  return { open, close };
}

function normaliseIndex(index: number, itemCount: number) {
  if (!itemCount) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

function setElementsHidden(elements: HTMLElement[], hidden: boolean) {
  elements.forEach((element) => {
    element.hidden = hidden;
    element.setAttribute('aria-hidden', String(hidden));

    if (hidden) {
      element.style.setProperty('display', 'none', 'important');
    } else {
      element.style.removeProperty('display');
    }
  });
}

function getImageSrc(img: HTMLImageElement) {
  const parentLink = img.closest<HTMLAnchorElement>('a[href]');
  const linkHref = parentLink?.getAttribute('href') || '';

  if (IMAGE_EXT_PATTERN.test(linkHref)) {
    return parentLink?.href || '';
  }

  return img.src || img.currentSrc;
}

function getImageCaption(img: HTMLImageElement) {
  const figcaption = img.closest('figure')?.querySelector('figcaption');
  return (figcaption?.textContent || img.alt || '').trim();
}
