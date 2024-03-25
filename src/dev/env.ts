import type { ENV } from 'global';

const ENV_LOCALSTORAGE_ID = 'jsEnv';

window.ENV = getENV();

window.setENV = (env) => {
  if (env !== 'dev' && env !== 'prod') {
    console.error('Invalid environment. Pass `dev` or `prod`');
    return;
  }

  localStorage.setItem(ENV_LOCALSTORAGE_ID, env);
  console.log(`Environment successfully set to ${env}`);
};

function getENV(): ENV {
  const localStorageItem = localStorage.getItem(ENV_LOCALSTORAGE_ID) as ENV;
  return localStorageItem || 'prod';
}

export {};
