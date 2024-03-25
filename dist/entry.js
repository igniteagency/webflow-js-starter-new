// src/dev/env.ts
var getENV = function() {
  const localStorageItem = localStorage.getItem(ENV_LOCALSTORAGE_ID);
  return localStorageItem || "prod";
};
var ENV_LOCALSTORAGE_ID = "jsEnv";
window.ENV = getENV();
window.setENV = (env) => {
  if (env !== "dev" && env !== "prod") {
    console.error("Invalid environment. Pass `dev` or `prod`");
    return;
  }
  localStorage.setItem(ENV_LOCALSTORAGE_ID, env);
  console.log(`Environment successfully set to ${env}`);
};

// src/dev/debug.ts
function getDebugMode() {
  const localStorageItem = localStorage.getItem(DEBUG_MODE_LOCALSTORAGE_ID);
  if (localStorageItem && localStorageItem === "true") {
    return true;
  }
  return false;
}
var DEBUG_MODE_LOCALSTORAGE_ID = "IS_DEBUG_MODE";
window.IS_DEBUG_MODE = getDebugMode();
window.DEBUG = function(...args) {
  if (window.IS_DEBUG_MODE) {
    console.log(...args);
  }
};
window.setDebugMode = (mode) => {
  localStorage.setItem(DEBUG_MODE_LOCALSTORAGE_ID, mode.toString());
};

// src/entry.ts
var addJS = function() {
  console.log(`Current mode: ${window.ENV}`);
  if (window.ENV === "dev") {
    fetchLocalScripts();
  }
};
var appendScripts = function() {
  const BASE = window.ENV === "dev" ? LOCALHOST_BASE : PRODUCTION_BASE;
  window.JS_SCRIPTS?.forEach((url) => {
    const script = document.createElement("script");
    script.src = BASE + url;
    script.defer = true;
    const promise = new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => {
        console.error(`Failed to load script: ${url}`);
      };
    });
    SCRIPT_LOAD_PROMISES.push(promise);
    document.body.appendChild(script);
  });
  Promise.allSettled(SCRIPT_LOAD_PROMISES).then(() => {
    window.DEBUG("All scripts loaded");
    window.dispatchEvent(new CustomEvent(SCRIPTS_LOADED_EVENT));
  });
};
var fetchLocalScripts = function() {
  const LOCALHOST_CONNECTION_TIMEOUT_IN_MS = 300;
  const localhostFetchController = new AbortController;
  const localhostFetchTimeout = setTimeout(() => {
    localhostFetchController.abort();
  }, LOCALHOST_CONNECTION_TIMEOUT_IN_MS);
  fetch(LOCALHOST_BASE, { signal: localhostFetchController.signal }).then((response) => {
    if (!response.ok) {
      console.error({ response });
      throw new Error("localhost response not ok");
    }
  }).catch(() => {
    console.error("localhost not resolved. Switching to production");
    window.setENV("prod");
  }).finally(() => {
    clearTimeout(localhostFetchTimeout);
    appendScripts();
  });
};
var LOCALHOST_BASE = "http://localhost:3000/";
var PRODUCTION_BASE = "https://cdn.jsdelivr.net/gh/igniteagency/webflow-js-starter/dist/";
window.JS_SCRIPTS = new Set;
var SCRIPTS_LOADED_EVENT = "scriptsLoaded";
var SCRIPT_LOAD_PROMISES = [];
window.addEventListener("DOMContentLoaded", addJS);
window.Webflow = window.Webflow || [];
window.Webflow.push(() => {
});
export {
  SCRIPTS_LOADED_EVENT
};

//# debugId=5F45E3C025E9AB9A64756e2164756e21
