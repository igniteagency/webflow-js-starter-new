/**
 * Entry point for the build system.
 * Fetches scripts from localhost or production site depending on the setup
 * Polls `localhost` on page load, else falls back to deriving code from production URL
 */
import './dev/env';
import './dev/debug';

const LOCALHOST_BASE = 'http://localhost:3000/';
const PRODUCTION_BASE = 'https://cdn.jsdelivr.net/gh/igniteagency/webflow-js-starter/dist/';

window.JS_SCRIPTS = new Set();

export const SCRIPTS_LOADED_EVENT = 'scriptsLoaded';

const SCRIPT_LOAD_PROMISES: Array<Promise<unknown>> = [];

// init adding scripts to the page
window.addEventListener('DOMContentLoaded', addJS);

/**
 * Sets an object `window.isLocal` and adds all the set scripts using the `window.JS_SCRIPTS` Set
 */
function addJS() {
  console.log(`Current mode: ${window.ENV}`);

  if (window.ENV === 'dev') {
    fetchLocalScripts();
  }
}

function appendScripts() {
  const BASE = window.ENV === 'dev' ? LOCALHOST_BASE : PRODUCTION_BASE;

  window.JS_SCRIPTS?.forEach((url) => {
    const script = document.createElement('script');
    script.src = BASE + url;
    script.defer = true;

    const promise = new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => {
        console.error(`Failed to load script: ${url}`);
        reject;
      };
    });

    SCRIPT_LOAD_PROMISES.push(promise);

    document.body.appendChild(script);
  });

  Promise.allSettled(SCRIPT_LOAD_PROMISES).then(() => {
    window.DEBUG('All scripts loaded');
    window.dispatchEvent(new CustomEvent(SCRIPTS_LOADED_EVENT));
  });
}

function fetchLocalScripts() {
  const LOCALHOST_CONNECTION_TIMEOUT_IN_MS = 300;
  const localhostFetchController = new AbortController();

  const localhostFetchTimeout = setTimeout(() => {
    localhostFetchController.abort();
  }, LOCALHOST_CONNECTION_TIMEOUT_IN_MS);

  fetch(LOCALHOST_BASE, { signal: localhostFetchController.signal })
    .then((response) => {
      if (!response.ok) {
        console.error({ response });
        throw new Error('localhost response not ok');
      }
    })
    .catch(() => {
      console.error('localhost not resolved. Switching to production');
      window.setENV('prod');
    })
    .finally(() => {
      clearTimeout(localhostFetchTimeout);
      appendScripts();
    });
}

window.Webflow = window.Webflow || [];
window.Webflow.push(() => {});
