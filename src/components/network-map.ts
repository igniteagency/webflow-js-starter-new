const ROOT_SELECTOR = '[data-network-map]';
const TRIGGER_SELECTOR = '[data-network-marker], [data-network-country]';
const ENTER_DELAY = 250;
const LEAVE_DELAY = 150;
const LABEL_GAP = 8;
const VIEWPORT_GUTTER = 8;
const POSITION_PROPERTIES = [
  'position',
  'inset',
  'margin',
  'position-area',
  'position-try-fallbacks',
  'left',
  'top',
];

interface NetworkMapFeatures {
  popover: boolean;
  interest: boolean;
  anchors: boolean;
}

interface Selection {
  trigger: HTMLButtonElement;
  label: HTMLElement;
  pinned: boolean;
  position: boolean;
}

export function detectNetworkMapFeatures(): NetworkMapFeatures {
  return {
    popover:
      'popover' in HTMLElement.prototype && typeof HTMLElement.prototype.showPopover === 'function',
    interest: 'interestForElement' in HTMLButtonElement.prototype,
    anchors:
      typeof CSS !== 'undefined' &&
      CSS.supports('position-anchor', 'auto') &&
      CSS.supports('position-area', 'top center') &&
      CSS.supports('position-try-fallbacks', 'flip-block'),
  };
}

export function initNetworkMap(
  scope: ParentNode = document,
  features: NetworkMapFeatures = detectNetworkMapFeatures()
) {
  const root = scope.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (!root || root.dataset.networkMapReady) return;

  const targets = new Map<HTMLButtonElement, HTMLElement>();
  root.querySelectorAll<HTMLButtonElement>(TRIGGER_SELECTOR).forEach((trigger) => {
    const id = trigger.getAttribute('popovertarget');
    const label = id ? document.getElementById(id) : null;
    if (
      trigger instanceof HTMLButtonElement &&
      label?.hasAttribute('popover') &&
      root.contains(label)
    ) {
      targets.set(trigger, label);
    }
  });
  if (!targets.size) return;
  const fallback = root.querySelector<HTMLElement>('[data-network-fallback]');
  if (!features.popover && !fallback) {
    console.error('Network map is missing its native fallback label.');
    return;
  }
  root.dataset.networkMapReady = 'true';

  const labels = new Set(targets.values());
  const previewFallback = !features.popover || !features.interest;
  const savedPositions = new Map<HTMLElement, [string, string, string][]>();
  let active: Selection | null = null;
  let previewSource: HTMLButtonElement | null = null;
  let pending: HTMLButtonElement | null = null;
  let hovered: HTMLButtonElement | null = null;
  let suppressed: HTMLButtonElement | null = null;
  let touchInput = false;
  let enterTimer = 0;
  let leaveTimer = 0;
  let positionFrame = 0;

  function updateExpanded() {
    if (!features.popover)
      targets.forEach((label, trigger) => {
        trigger.setAttribute('aria-expanded', String(label === active?.label));
      });
  }

  function clearTimers() {
    window.clearTimeout(enterTimer);
    window.clearTimeout(leaveTimer);
    pending = null;
  }

  function restorePosition(label: HTMLElement) {
    savedPositions.get(label)?.forEach(([name, value, priority]) => {
      if (value) label.style.setProperty(name, value, priority);
      else label.style.removeProperty(name);
    });
    savedPositions.delete(label);
  }

  function close() {
    clearTimers();
    const previous = active;
    active = null;
    if (features.popover && previous?.label.matches(':popover-open')) {
      previous.label.hidePopover();
    }
    if (previous) restorePosition(previous.label);
    if (fallback) fallback.style.display = 'none';
    updateExpanded();
    cancelAnimationFrame(positionFrame);
    positionFrame = 0;
  }

  function triggerIsVisible(trigger: HTMLElement) {
    if (!trigger.isConnected || !trigger.getClientRects().length) return false;
    const rect = trigger.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return false;
    for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (
        /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
        (x < bounds.left || x > bounds.right)
      )
        return false;
      if (
        /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
        (y < bounds.top || y > bounds.bottom)
      )
        return false;
      if (parent === root) break;
    }
    return true;
  }

  function positionLabel() {
    positionFrame = 0;
    if (!active || !active.position) return;
    if (!triggerIsVisible(active.trigger)) {
      close();
      return;
    }
    const label = features.popover ? active.label : fallback;
    if (!label || (features.popover && !label.matches(':popover-open'))) return;

    if (features.popover && !savedPositions.has(label)) {
      savedPositions.set(
        label,
        POSITION_PROPERTIES.map((name) => [
          name,
          label.style.getPropertyValue(name),
          label.style.getPropertyPriority(name),
        ])
      );
      label.style.position = 'fixed';
      label.style.inset = 'auto';
      label.style.margin = '0';
      label.style.setProperty('position-area', 'none');
      label.style.setProperty('position-try-fallbacks', 'none');
    }
    const triggerRect = active.trigger.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + VIEWPORT_GUTTER;
    const topEdge = (viewport?.offsetTop || 0) + VIEWPORT_GUTTER;
    const rightEdge =
      (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) - VIEWPORT_GUTTER;
    const bottomEdge =
      (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - VIEWPORT_GUTTER;
    let left = Math.max(
      leftEdge,
      Math.min(
        triggerRect.left + (triggerRect.width - labelRect.width) / 2,
        rightEdge - labelRect.width
      )
    );
    let top = triggerRect.top - labelRect.height - LABEL_GAP;
    if (top < topEdge) top = triggerRect.bottom + LABEL_GAP;
    top = Math.max(topEdge, Math.min(top, bottomEdge - labelRect.height));

    if (!features.popover) {
      const bounds = root!.getBoundingClientRect();
      const scaleX = bounds.width / root!.offsetWidth || 1;
      const scaleY = bounds.height / root!.offsetHeight || 1;
      left = (left - bounds.left) / scaleX + root!.scrollLeft - root!.clientLeft;
      top = (top - bounds.top) / scaleY + root!.scrollTop - root!.clientTop;
    }
    label.style.left = `${left}px`;
    label.style.top = `${top}px`;
  }

  function queuePosition() {
    if (active?.position && !positionFrame) {
      positionFrame = requestAnimationFrame(positionLabel);
    }
  }

  function showPreview(trigger: HTMLButtonElement) {
    const label = targets.get(trigger);
    if (!label || suppressed === trigger || !triggerIsVisible(trigger)) return;
    if (active?.trigger === trigger) return;
    close();
    active = { trigger, label, pinned: false, position: !features.popover || !features.anchors };
    if (features.popover) {
      const show = label.showPopover as (options?: { source: HTMLElement }) => void;
      previewSource = trigger;
      show.call(label, { source: trigger });
      previewSource = null;
    } else if (fallback) {
      fallback.textContent = label.textContent;
      fallback.style.display = 'block';
      updateExpanded();
    }
    positionLabel();
  }

  function schedulePreview(trigger: HTMLButtonElement) {
    if (suppressed === trigger) return;
    clearTimers();
    pending = trigger;
    enterTimer = window.setTimeout(() => {
      pending = null;
      showPreview(trigger);
    }, ENTER_DELAY);
  }

  function scheduleClose() {
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!active || active.pinned) return;
      const label = features.popover ? active.label : fallback;
      if (
        hovered !== active.trigger &&
        document.activeElement !== active.trigger &&
        !label?.matches(':hover') &&
        !label?.contains(document.activeElement)
      )
        close();
    }, LEAVE_DELAY);
  }

  function bindLabelHover(label: HTMLElement) {
    label.addEventListener('pointerenter', () => window.clearTimeout(leaveTimer));
    label.addEventListener('pointerleave', scheduleClose);
  }

  if (!features.popover) {
    updateExpanded();
    bindLabelHover(fallback!);
  }

  labels.forEach((label) => {
    if (previewFallback && features.popover) bindLabelHover(label);
    if (!features.popover) return;
    label.addEventListener('beforetoggle', (event) => {
      const change = event as ToggleEvent & { source?: Element | null };
      if (change.newState !== 'open') return;
      const source = change.source;
      if (previewSource && active?.label === label) {
        active.position = !features.anchors || source !== previewSource;
      }
      if (source instanceof HTMLButtonElement && targets.get(source) === label) {
        const current = active?.label === label && active.trigger === source ? active : null;
        active = current || { trigger: source, label, pinned: false, position: !features.anchors };
      }
      queuePosition();
    });
    label.addEventListener('toggle', () => {
      if (!label.matches(':popover-open')) {
        restorePosition(label);
        if (active?.label === label) {
          clearTimers();
          active = null;
        }
      } else queuePosition();
    });
  });

  targets.forEach((label, trigger) => {
    trigger.addEventListener('click', (event) => {
      clearTimers();
      suppressed = null;
      if (
        features.popover &&
        label.matches(':popover-open') &&
        (active?.trigger !== trigger || (features.anchors && savedPositions.has(label)))
      ) {
        label.hidePopover();
        restorePosition(label);
      }
      if (!features.popover) {
        event.preventDefault();
        close();
        fallback!.textContent = label.textContent;
        fallback!.style.display = 'block';
      }
      active = { trigger, label, pinned: true, position: !features.popover || !features.anchors };
      updateExpanded();
      queuePosition();
    });
    if (!previewFallback || !trigger.hasAttribute('data-network-marker')) return;
    trigger.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hovered = trigger;
      schedulePreview(trigger);
    });
    trigger.addEventListener('pointerleave', () => {
      if (hovered === trigger) hovered = null;
      if (document.activeElement !== trigger && suppressed === trigger) suppressed = null;
      if (pending === trigger) clearTimers();
      scheduleClose();
    });
    trigger.addEventListener('focus', () => {
      if (!touchInput) schedulePreview(trigger);
    });
    trigger.addEventListener('blur', () => {
      if (hovered !== trigger && suppressed === trigger) suppressed = null;
      if (pending === trigger) clearTimers();
      scheduleClose();
    });
  });

  document.addEventListener('pointerdown', (event) => {
    touchInput = event.pointerType === 'touch';
    const node = event.target as Node;
    if (
      active?.trigger.contains(node) ||
      active?.label.contains(node) ||
      fallback?.contains(node)
    ) {
      return;
    }
    clearTimers();
    if (!features.popover) close();
  });
  document.addEventListener('keydown', (event) => {
    touchInput = false;
    if (event.key !== 'Escape' || (!active && !pending)) return;
    suppressed = active?.trigger || pending;
    clearTimers();
    if (!features.popover) {
      close();
      event.preventDefault();
    }
  });
  root.addEventListener(
    'toggle',
    (event) => {
      if (
        event.target instanceof HTMLDetailsElement &&
        active &&
        !triggerIsVisible(active.trigger)
      ) {
        close();
      }
    },
    true
  );
  document.addEventListener('scroll', queuePosition, { capture: true, passive: true });
  window.addEventListener('resize', queuePosition, { passive: true });
  window.visualViewport?.addEventListener('resize', queuePosition, { passive: true });
  window.visualViewport?.addEventListener('scroll', queuePosition, { passive: true });
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initNetworkMap());
}
