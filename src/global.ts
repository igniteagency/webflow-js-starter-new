import { setCurrentYear } from '$utils/current-year';

window.Webflow = window.Webflow || {};
window.Webflow?.push(() => {
  // Set current year on respective elements
  setCurrentYear();
});
