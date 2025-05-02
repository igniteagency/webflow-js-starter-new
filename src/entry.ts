/**
 * Entry point for the build system.
 * Fetches scripts from localhost or production site depending on the setup
 * Polls `localhost` on page load, else falls back to deriving code from production URL
 */
import { SCRIPTS_LOADED_EVENT } from 'src/constants';

import '$utils/external-script-embed';

import './dev/debug';
import './dev/script-source';

const LOCALHOST_BASE = 'http://localhost:3000/';
const consoleHighlightStyle = 'color: red;';
window.PRODUCTION_BASE = 'https://cdn.jsdelivr.net/gh/igniteagency/{{repo}}/dist/prod/';

window.JS_SCRIPTS = new Set();

const SCRIPT_LOAD_PROMISES: Array<Promise<unknown>> = [];

// init adding scripts to the page
window.addEventListener('DOMContentLoaded', addJS);

/**
 * Adds all the set scripts to the `window.JS_SCRIPTS` Set
 */
function addJS() {
  console.debug(`Current script loading mode: %c${window.SCRIPTS_ENV}`, consoleHighlightStyle);

  if (window.SCRIPTS_ENV === 'local') {
    console.debug(
      "To run JS scripts from production CDN, execute `%csetScriptSource('cdn')%c` in the browser console",
      consoleHighlightStyle,
      ''
    );
    fetchLocalScripts();
  } else {
    console.debug(
      "To run JS scripts from localhost, execute `%csetScriptSource('local')%c` in the browser console",
      consoleHighlightStyle,
      ''
    );
    appendScripts();
  }
}

function appendScripts() {
  const BASE = window.SCRIPTS_ENV === 'local' ? LOCALHOST_BASE : window.PRODUCTION_BASE;

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
    console.debug('All scripts loaded');
    // Add a small delay to ensure all scripts have had a chance to execute
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SCRIPTS_LOADED_EVENT));
    }, 50);
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
      window.setScriptSource('cdn');
    })
    .finally(() => {
      clearTimeout(localhostFetchTimeout);
      appendScripts();
    });
}
