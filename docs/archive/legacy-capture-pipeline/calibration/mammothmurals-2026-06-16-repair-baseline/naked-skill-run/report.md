# Motion Decompile Report

Generated: 2026-06-16T02:54:05.818Z
URL: https://mammothmurals.com/
Viewport: 1280x800
Run directory: /home/martin/src/perso/motion-decompiler/runs/mammothmurals.com/2026-06-16-run

## Artifacts

- `manifest.json`
- `map.json`
- `page-state.json`
- `capture-results.json`
- `manifest.proposed.json`
- `capture-plan.json`
- `capture-plan.md`
- `animations.json`
- `animations.md`
- `timelines/*.json`
- `run-log.md`

## Map Summary

- Libraries: GSAP, ScrollTrigger, Lenis, Webflow, jQuery
- ScrollTriggers: 8
- Hover candidates: 64
- CSS hovers: 13
- Loops: 10
- Split reveals: 6

## Page State

- Readiness samples: 4
- No loader, challenge, or rate-limit blockers detected by the readiness probe.

## Captures

| ID | Type | Page | Status | Moved | Stop | Summary | Timeline |
| -- | -- | -- | -- | -- | -- | -- | -- |
| split-reveal-0-div-menu-links-text-u-text-style-display | scroll-reveal | reuse-page / main-page-after-intro | error | 0 | error | Preflight failed for scrollintoview div.menu_links_text.u-text-style-display: selector matched no visible elements |  |
| split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88 | scroll-reveal | reuse-page / main-page-after-intro / reused | empty | 0 | stopped | no animation captured | timelines/split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88.json |
| split-reveal-2-div-navbar-home-link-text-u-text-style-display | scroll-reveal | reuse-page / main-page-after-intro / reused | empty | 0 | manualDump | no animation captured | timelines/split-reveal-2-div-navbar-home-link-text-u-text-style-display.json |
| split-reveal-3-h1-hero-home-heading-u-text-style-display | scroll-reveal | reuse-page / main-page-after-intro / reused | empty | 0 | manualDump | no animation captured | timelines/split-reveal-3-h1-hero-home-heading-u-text-style-display.json |
| split-reveal-4-p-hero-home-p-u-text-style-large | scroll-reveal | reuse-page / main-page-after-intro / reused | empty | 0 | manualDump | no animation captured | timelines/split-reveal-4-p-hero-home-p-u-text-style-large.json |
| split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f | scroll-reveal | reuse-page / main-page-after-intro / reused | empty | 0 | manualDump | no animation captured | timelines/split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f.json |
| loop-0-div-partners-home-wrap | manual | reuse-page / main-page-after-intro / reused | check | 7 | manualDump | Staggered 7-item animation (e.g. split text): each item transform change, ~250.4ms apart, 1.3s (measured) unknown (rAF/JS) - verify. | timelines/loop-0-div-partners-home-wrap.json |
| scroll-3-div-g-cta-collection | scroll-reveal | reuse-page / main-page-after-intro / opened | ok | 2 | settled | 2 layers animate together: div.hero_contact_top-left.u-sprite [CSS sprite-sheet: 4 frames stepped via background-position]; div.hero_contact_top-left.u-sprite [CSS sprite-sheet: 4 frames stepped via background-position] - 0.5s . | timelines/scroll-3-div-g-cta-collection.json |
| scroll-7-div-work-home-cover | scroll-reveal | reuse-page / main-page-after-intro / reused | ok | 2 | settled | 2 layers animate together: img.work_home_image.u-ratio-3-2 [opacity: 1 -> 0]; img.work_home_image.u-ratio-3-2 [opacity: 0 -> 1] - 0.31s (measured) unknown (rAF/JS) - verify. | timelines/scroll-7-div-work-home-cover.json |
| accordion-click | click | fresh / opened | check | 32 | manualDump | Staggered 12-item animation (e.g. split text): each item x -211.09->-241.99px, ~13.9ms apart, 0.38s (measured) unknown (rAF/JS) - verify. | timelines/accordion-click.json |
| css-hover-div-vimeo-lightbox-btn | hover | reuse-page / main-page-after-intro | error | 0 | error | Preflight failed for hover div.vimeo-lightbox__btn: selector matched no visible elements |  |
| css-hover-button-vimeo-lightbox-close | hover | fresh / opened | ok | 1 | settled | One element animates: button.vimeo-lightbox__close [scale 1->0.95, rotate 0->-90deg + opacity] - 0.5s cubic-bezier(0.625, 0.05, 0, 1). | timelines/css-hover-button-vimeo-lightbox-close.json |
| work-card-hover | hover | reuse-page / main-page-after-intro / reused | ok | 6 | settled | Staggered 5-item animation (e.g. split text): each item scale 1.1->1, ~16.9ms apart, 0.65s cubic-bezier(0.16, 1, 0.3, 1). | timelines/work-card-hover.json |
| wordmark-hover | hover | reuse-page / main-page-after-intro / reused | ok | 13 | settled | Staggered 13-item animation (e.g. split text): each item y 0->-31.1px, ~3.7ms apart, 0.28s (measured) unknown (rAF/JS) - verify. | timelines/wordmark-hover.json |
| primary-button-hover | hover | reuse-page / main-page-after-intro / reused | ok | 2 | settled | 2 layers animate together: span.navbar_btn_container [scale 1->0]; span.navbar_btn_container [y 44.02->0px, rotateX -34.4->0deg, rotateY -19.1->0deg, rotateZ 23.1->0deg] - 0.45s cubic-bezier(0.31, 0.75, 0.22, 1). | timelines/primary-button-hover.json |
| services-cta-hover | hover | reuse-page / main-page-after-intro / reused | check | 20 | manualDump | Staggered 6-item animation (e.g. split text): each item x -11.52->0px, ~60ms apart, 0.45s cubic-bezier(0.31, 0.75, 0.22, 1). | timelines/services-cta-hover.json |
| nav-link-hover | hover | reuse-page / main-page-after-intro / reused | ok | 2 | settled | 2 layers animate together: span.navbar_btn_container [scale 1->0]; span.navbar_btn_container [y 44.02->0px, rotateX -34.4->0deg, rotateY -19.1->0deg, rotateZ 23.1->0deg] - 0.45s cubic-bezier(0.31, 0.75, 0.22, 1). | timelines/nav-link-hover.json |
| link-hover | hover | reuse-page / main-page-after-intro | error | 0 | error | Preflight failed for hover a.g_link_text.u-text-style-small: selector center is covered by div.g_btn_container |  |

## Empty Captures

- **split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88** [cause: occlusion]: no animation captured. Try a tighter selector, a visible starting state, or a manual/in-view recipe.
- **split-reveal-2-div-navbar-home-link-text-u-text-style-display** [cause: inert_representative]: no animation captured. Try a tighter selector, a visible starting state, or a manual/in-view recipe.
- **split-reveal-3-h1-hero-home-heading-u-text-style-display** [cause: inert_representative]: no animation captured. Try a tighter selector, a visible starting state, or a manual/in-view recipe.
- **split-reveal-4-p-hero-home-p-u-text-style-large** [cause: inert_representative]: no animation captured. Try a tighter selector, a visible starting state, or a manual/in-view recipe.
- **split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f** [cause: inert_representative]: no animation captured. Try a tighter selector, a visible starting state, or a manual/in-view recipe.

## Failed Captures

- **split-reveal-0-div-menu-links-text-u-text-style-display** [cause: hidden_not_visible]: Preflight failed for scrollintoview div.menu_links_text.u-text-style-display: selector matched no visible elements
- **css-hover-div-vimeo-lightbox-btn** [cause: hidden_not_visible]: Preflight failed for hover div.vimeo-lightbox__btn: selector matched no visible elements
- **link-hover** [cause: occlusion]: Preflight failed for hover a.g_link_text.u-text-style-small: selector center is covered by div.g_btn_container

## Notes

- `animations.json` is the canonical assembled spec; `animations.md` is rendered from it.
- Capture reliability still depends on selectors resolving in a real visible browser.
