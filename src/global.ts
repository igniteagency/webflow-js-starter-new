import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { setCurrentYear } from '$utils/current-year';

window.gsap = gsap;
window.ScrollTrigger = ScrollTrigger;
window.gsap.registerPlugin(ScrollTrigger);

window.Webflow = window.Webflow || {};
window.Webflow?.push(() => {
  // Set current year on respective elements
  setCurrentYear();
});
