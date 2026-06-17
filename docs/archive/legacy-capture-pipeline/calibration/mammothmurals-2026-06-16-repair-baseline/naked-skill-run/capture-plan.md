# Capture Plan

Generated: 2026-06-16T02:44:23.842Z
URL: https://mammothmurals.com/
Viewport: 1280x800
Manifest: manifest.proposed.json
Capture strategy: reuse-page

## Summary

- Proposed captures: 18
- ScrollTriggers in map: 8
- Hover candidates in map: 64
- CSS hover timing groups: 13
- Split reveal hosts: 6

## Proposed Captures

| ID | Type | Page | Root | Wait | Reason |
| -- | -- | -- | -- | -- | -- |
| split-reveal-0-div-menu-links-text-u-text-style-display | scroll-reveal | main-page-after-intro | div.menu_links_text.u-text-style-display | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88 | scroll-reveal | main-page-after-intro | div.g_link_span.w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88 | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| split-reveal-2-div-navbar-home-link-text-u-text-style-display | scroll-reveal | main-page-after-intro | div.navbar_home_link_text.u-text-style-display | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| split-reveal-3-h1-hero-home-heading-u-text-style-display | scroll-reveal | main-page-after-intro | h1.hero_home_heading.u-text-style-display | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| split-reveal-4-p-hero-home-p-u-text-style-large | scroll-reveal | main-page-after-intro | p.hero_home_p.u-text-style-large | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f | scroll-reveal | main-page-after-intro | div.g_link_span.w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f | 1800 | Split reveal host detected on a ScrollTrigger page; use timed scroll capture: settle, arm, scroll into view, wait, dump. |
| loop-0-div-partners-home-wrap | manual | main-page-after-intro | div.partners_home_wrap | 1600 | ScrollTrigger 0 gates an in-view loop/marquee. Scroll into view first, then capture with a manual scan. |
| scroll-3-div-g-cta-collection | scroll-reveal | main-page-after-intro | div.g_cta_collection | 1600 | ScrollTrigger 3 has callbacks (onEnter) but no bound tween in the registry. |
| scroll-7-div-work-home-cover | scroll-reveal | main-page-after-intro | div.work_home_cover | 1600 | ScrollTrigger 7 has callbacks (onEnter, onLeave, onEnterBack, onLeaveBack) but no bound tween in the registry. |
| accordion-click | click | fresh | div.accordion_css_item_contain | 900 | Accordion or FAQ selectors were present in the map. Stateful click is isolated by default; add resetAction + reusePage:true if batching is safe. |
| css-hover-div-vimeo-lightbox-btn | hover | main-page-after-intro | div.vimeo-lightbox__btn | 950 | Representative CSS hover group: opacity 0.3s linear. |
| css-hover-button-vimeo-lightbox-close | hover | main-page-after-intro | button.vimeo-lightbox__close | 1150 | Representative CSS hover group: all 0.5s cubic-bezier(0.625, 0.05, 0, 1). |
| work-card-hover | hover | main-page-after-intro | a.work_home_item_link.w-inline-block | 1300 | Representative hover candidate for work-card-hover; deduped from 64 mapped hover candidate(s). |
| wordmark-hover | hover | main-page-after-intro | a.navbar_home_link_wordmark.w-inline-block | 1300 | Representative hover candidate for wordmark-hover; deduped from 64 mapped hover candidate(s). |
| primary-button-hover | hover | main-page-after-intro | a.navbar_btn_default.w-inline-block | 1300 | Representative hover candidate for primary-button-hover; deduped from 64 mapped hover candidate(s). |
| services-cta-hover | hover | main-page-after-intro | a.services_home_cta.w-inline-block | 1300 | Representative hover candidate for services-cta-hover; deduped from 64 mapped hover candidate(s). |
| nav-link-hover | hover | main-page-after-intro | li.navbar_links_li | 1300 | Representative hover candidate for nav-link-hover; deduped from 64 mapped hover candidate(s). |
| link-hover | hover | main-page-after-intro | a.g_link_text.u-text-style-small | 1300 | Representative hover candidate for link-hover; deduped from 64 mapped hover candidate(s). |

## Skipped

- **scrolltrigger-6**: Callback-only ScrollTrigger has no trigger selector in map.json.
- **css-hover-span-navbar-btn-container**: covered by parent navbar button hover.
- **css-hover-div-g-btn-container**: covered by parent button/CTA hover.
- **css-hover-div-work-home-cover-deco**: covered by parent work-card-hover.
- **css-hover-div-work-home-link-overlay**: covered by parent work-card-hover.
- **css-hover-div-work-home-link-clip**: covered by parent work-card-hover.
- **css-hover-div-g-btn-container-w-variant-0cb8073d-b726-480f-f755-814264e2f505**: covered by parent button/CTA hover.
- **hover-w-node-f0092fd8-4d8b-da06-857d-4cb081e79381-81e7936b**: Generated Webflow node id is too brittle for a default capture plan.
- **hover-w-node-f0092fd8-4d8b-da06-857d-4cb081e7938c-81e7936b**: Generated Webflow node id is too brittle for a default capture plan.
- **hover-div-hero-contact-top-left-u-sprite**: Sprite/keyframe elements are represented by loop entries, not hover captures.

## Next

Run `./bin/motion-decompile capture <run-dir> manifest.proposed.json` after reviewing selectors.
