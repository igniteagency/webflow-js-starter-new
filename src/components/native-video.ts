export function initNativeVideo(root: HTMLElement) {
  const video = root.querySelector<HTMLVideoElement>('[data-video-el="player"]');
  if (!video || root.dataset.videoReady) return;
  root.dataset.videoReady = 'true';
  const toggle = root.querySelector<HTMLButtonElement>('[data-video-el="toggle"]');
  video.removeAttribute('autoplay');
  video.autoplay = false;
  video.playsInline = true;
  if (video.dataset.videoPlayer?.toLowerCase() === 'true') {
    video.removeAttribute('muted');
    video.removeAttribute('loop');
    video.muted = false;
    video.loop = false;
    video.controls = true;
    video.style.objectFit = 'contain';
    if (toggle) toggle.hidden = true;
    return;
  }
  video.muted = true;
  video.loop = true;
  video.style.objectFit = 'cover';
  if (!toggle) return;
  video.controls = false;
  toggle.hidden = false;
  toggle.style.display = '';
  const playIcon = root.querySelector<HTMLElement>('[data-video-el="play-icon"]');
  const pauseIcon = root.querySelector<HTMLElement>('[data-video-el="pause-icon"]');
  const sync = () => {
    toggle.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
    for (const [icon, hidden] of [
      [playIcon, !video.paused],
      [pauseIcon, video.paused],
    ] as const) {
      if (icon) {
        icon.hidden = hidden;
        icon.style.display = hidden ? 'none' : '';
      }
    }
  };
  let inView = false;
  let userPaused = false;
  const play = () =>
    video.play().catch(() => {
      sync();
    });
  toggle.addEventListener('click', () => {
    userPaused = !video.paused;
    if (video.paused) void play();
    else video.pause();
  });
  video.addEventListener('play', sync);
  video.addEventListener('pause', sync);
  sync();
  const view = root.ownerDocument.defaultView;
  const motion = view?.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (
    view?.navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        addEventListener?: (name: string, callback: () => void) => void;
      };
    }
  )?.connection;
  const updatePlayback = () => {
    if (
      inView &&
      !root.ownerDocument.hidden &&
      !userPaused &&
      !motion?.matches &&
      !connection?.saveData
    )
      void play();
    else video.pause();
  };
  motion?.addEventListener('change', updatePlayback);
  connection?.addEventListener?.('change', updatePlayback);
  root.ownerDocument.addEventListener('visibilitychange', updatePlayback);
  if (view?.IntersectionObserver) {
    new view.IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updatePlayback();
      },
      { threshold: 0.05 }
    ).observe(root);
  }
}

export function initNativeVideos(scope: ParentNode = document) {
  scope
    .querySelectorAll<HTMLElement>('[data-video-controller="starter-native-v1"]')
    .forEach(initNativeVideo);
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initNativeVideos());
}
