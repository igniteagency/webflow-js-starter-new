import { animatedDetailsAccordions } from '$components/accordions';
import { setCurrentYear } from '$utils/current-year';
import '$utils/disable-webflow-scroll';
import addMainElementId from '$utils/main-element-id';

gsap.registerPlugin(ScrollTrigger);

window.Webflow = window.Webflow || [];
window.Webflow?.push(() => {
  // Set current year on respective elements
  setCurrentYear();
  addMainElementId();

  animatedDetailsAccordions();
});
