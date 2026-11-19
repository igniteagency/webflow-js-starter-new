type ManagerWindow = Window & {
  VideoManagerPlayer?: { mount: () => void; destroy: (video: HTMLVideoElement) => void };
};

const PLAYER_SCRIPTS = new Map<string, Promise<void>>();

function managerScript(source: URL) {
  const media = source.pathname.lastIndexOf('/media/');
  return media < 0
    ? null
    : `${source.origin}${source.pathname.slice(0, media)}/player/video-player.v1.js`;
}

function loadPlayer(url: string) {
  let pending = PLAYER_SCRIPTS.get(url);
  if (!pending) {
    pending = window.loadScript(url, { scriptName: 'film-video-player', placement: 'head' });
    PLAYER_SCRIPTS.set(url, pending);
    pending.catch(() => PLAYER_SCRIPTS.delete(url));
  }
  return pending;
}

export function initFilmReveal(root: HTMLElement) {
  const video = root.querySelector<HTMLVideoElement>('[data-film-reveal-part="video"]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-film-reveal-part="toggle"]');
  const controls = root.querySelector<HTMLElement>('[data-film-reveal-part="controls"]');
  const status = root.querySelector<HTMLElement>('[data-film-reveal-part="status"]');
  const track = root.querySelector<HTMLElement>('.film-reveal_track');
  const stage = root.querySelector<HTMLElement>('.film-reveal_stage');
  if (!video || !toggle || !controls || !track || !stage || root.dataset.filmVideoReady) return;
  let source: URL;
  try {
    source = new URL(root.dataset.filmRevealSrc || '');
    if (!['https:', 'http:'].includes(source.protocol)) return;
  } catch {
    return;
  }
  root.dataset.filmVideoReady = 'true';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  const poster = root.dataset.filmRevealPoster?.trim();
  if (poster) video.poster = poster;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let inView = false;
  let userPaused = false;
  let userStarted = false;
  let failed = false;
  let attaching: Promise<void> | undefined;
  let generation = 0;
  let frame = 0;

  const revealProgress = () => {
    const scrollReveal =
      root.dataset.filmRevealEnabled?.toLowerCase() === 'true' &&
      getComputedStyle(stage).position === 'sticky' &&
      !motion.matches;
    if (!scrollReveal) return 1;
    const distance = Math.max(1, track.offsetHeight - stage.offsetHeight);
    return Math.max(0, Math.min(1, -track.getBoundingClientRect().top / distance));
  };
  const eligible = () =>
    inView &&
    !document.hidden &&
    !userPaused &&
    (userStarted || (!motion.matches && !connection?.saveData && revealProgress() > 0.12));
  const sync = () => {
    const playing = !video.paused && !video.ended;
    const label = failed ? 'Retry film' : playing ? 'Pause film' : 'Play film';
    toggle.textContent = label;
    toggle.setAttribute('aria-label', label);
    root.dataset.filmPlayback = playing ? 'playing' : 'paused';
    root.dataset.filmControlsVisible = String(
      revealProgress() > 0.12 || motion.matches || userStarted
    );
  };
  const showError = () => {
    failed = true;
    root.dataset.filmVideoLoaded = 'false';
    if (status) status.textContent = 'Film could not play. Select Retry film to try again.';
    sync();
  };
  const attach = () => {
    if (attaching) return attaching;
    attaching = (async () => {
      if (/\.m3u8$/i.test(source.pathname)) {
        const script = managerScript(source);
        if (!script) throw new Error('Use the complete Copy video URL from Video Manager.');
        await loadPlayer(script);
        video.setAttribute('data-video-src', source.href);
        (window as ManagerWindow).VideoManagerPlayer?.mount();
      } else {
        video.src = source.href;
      }
    })();
    return attaching;
  };
  const update = () => {
    sync();
    const ticket = ++generation;
    if (!eligible() || failed) {
      video.pause();
      return;
    }
    void attach()
      .then(() => {
        if (ticket !== generation || !eligible()) return;
        return video.play().catch(() => {
          if (ticket !== generation || !eligible()) return;
          userPaused = true;
          if (status) status.textContent = 'Select Play film to start playback.';
          sync();
        });
      })
      .catch(showError);
  };
  toggle.addEventListener('click', () => {
    if (!video.paused && !video.ended) {
      userPaused = true;
      userStarted = false;
    } else {
      userPaused = false;
      userStarted = true;
      if (failed) {
        (window as ManagerWindow).VideoManagerPlayer?.destroy(video);
        video.removeAttribute('data-video-src');
        attaching = undefined;
        failed = false;
      }
      if (status) status.textContent = '';
    }
    update();
  });
  video.addEventListener('loadeddata', () => {
    root.dataset.filmVideoLoaded = 'true';
  });
  video.addEventListener('video-player-error', showError);
  video.addEventListener('error', showError);
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, sync);
  document.addEventListener('visibilitychange', update);
  motion.addEventListener('change', update);
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener(
    'scroll',
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    },
    { passive: true }
  );
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        update();
      },
      { threshold: [0, 0.2] }
    ).observe(stage);
  } else {
    inView = true;
    userPaused = true;
  }
  sync();
}

if (typeof document !== 'undefined') {
  const init = () =>
    document.querySelectorAll<HTMLElement>('.section_film-reveal').forEach(initFilmReveal);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
