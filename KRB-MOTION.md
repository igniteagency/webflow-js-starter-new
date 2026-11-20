# KRB motion runtime

Load `dist/prod/components/krb-motion.js` in the page head through the existing project script loader/registered hosted-script mechanism. All styling remains authored in Webflow. GSAP core, SplitText, ScrollTrigger and Flip use the verified Webflow GSAP 3.15.0 distribution; the module reuses loaded copies.

## Native hooks

- `.opening_panel` and `.opening_crest` are siblings. Both are hidden by default. The active panel should use `pointer-events:auto` to intercept clicks; pointerdown settles the sequence immediately. The crest uses the original standalone logo artwork, fixed at the viewport centre. CSS exposes both while `html[data-krb-opening]` is present. `pending` and `running` are transient runtime values; remove the attribute to restore the native final page.
- Hide only `.navbar_component .logo_primary [fill*="--_theme---accent"]` while the opening is active, so the travelling crest replaces the original crest without hiding the wordmark. The runtime reads the original logo SVG viewbox geometry and computed crest fill; during the final 450ms of travel, the moving artwork transitions to that destination colour for a seamless swap. It does not mutate the destination SVG.
- `html[data-krb-hero="ready"]` starts the CSS hero entrance. `pending` delays it; `settled` skips it after user interruption, reduced motion, deep links and restored navigation. Hero translation remains independent from the CSS entrance scale.
- Hero `.section_hero .hero_heading h1` and section `h2.heading` use the same masked SplitText helper. Hero timing follows the `data-krb-hero` state; other headings reveal on viewport entry. Set `text-wrap:wrap` for `[data-krb-motion]` text in authored CSS, because balanced wrapping conflicts with line measurement.
- `.intro_statement-text` is SplitText's source. The runtime creates `.krb-motion-line`, its automatic `.krb-motion-line-mask` wrappers, and `.krb-motion-phrase` spans. GSAP owns line entrances and phrase opacity progression. Original text is restored for reduced motion and print. On `.section_intro` only, any generic `data-reveal` is removed at startup and recorded as `data-krb-original-reveal`, avoiding a competing section fade. Native text remains readable if libraries cannot load.

## CSS first image fallback contract

Images are classified from existing native hierarchy, without generated roles:

- `.image-wrapper:has(> .image-clip > .image > img)` defaults to standalone.
- `.card_item > .image-wrapper` and `.blog_image-wrapper:has(img)` are cards (no parallax).
- `.section_hero .image-wrapper` is a hero.
- `.post-header_media:has(> img)`, `.section_full-image .image-wrapper` and the primary image of `.section_media-spread[data-wf--section-media-spread--variant="feature-with-pair"]` are full images. Content Section images below the copy are also full: `.content-section_layout > .image-wrapper` excluding the native left/right layout variants `145102da-d2c7-fe63-d84b-36178f62d532` and `1455e40b-28f4-b80f-3eeb-90291432c808`.
- Film Reveal, History Timeline and dialog images are excluded.

The compact breakpoint is 767px, matching Webflow CSS. Modern browsers use authored CSS `animation-trigger` and scroll/view timelines. Only if those properties are unsupported does this module add:

- `data-motion-reveal="pending"` to below-viewport standalone/card images, followed by `visible` when entering. CSS owns the entire composite mask and its duration. Initial visible content is never hidden.
- `data-motion-trigger="visible"` on `.divider`, `.card_item` and `.sacred-heart-network_art` as they enter. CSS owns divider, direct card copy and network-marker keyframes. Existing visible/restored content is left in its native state.
- `data-motion-scroll="fallback"`, `--krb-parallax` in pixels and `--krb-image-scale` as a number. Fallback CSS consumes translate on `.image` and scale on `.image-inner`; post-header media frames apply both to their direct child `.post-header_image`. Hero receives translate only; cards receive neither. Full-image shrink uses smoothstep over the complete wrapper viewport pass; parallax uses the same progress without easing. Travel distance is measured from the photo clip height, so in-flow captions do not increase movement beyond the authored overscan.

Viewport resizes before the sequence starts are harmless; its destination is measured at start. The opening settles on keyboard, focus, wheel, touch, pointerdown, resize, visibility change or page exit. It skips reduced motion, hashes, non-home pages and restored/back-forward navigation, and fails open if its dependencies do not initialise.

## Validation

`bun run build` and `node --test tests/*.test.mjs` verify the build, script startup failure paths, navigation exemptions, complete-viewport fallback progress and existing components. The repository-wide TypeScript check has pre-existing errors outside this module; no `krb-motion.ts` diagnostics remain. Published Webflow/native Designer integration still requires the lead's visual verification.
