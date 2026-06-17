# Animation Spec

Source: https://mammothmurals.com/
Captured: 2026-06-16
Viewport: 1280x800
Stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery

## Signature moments
- **Services home cta w inline block hover** (services-cta-hover) · hover · transform + color · layers: 20 · duration: 0.45s · ease: ease.cubic-0-31-0-75-0-22-1 · confidence: measured · ref: timelines/services-cta-hover.json
- **Accordion open/close** (accordion-click) · click · transform + css-sprite + height · layers: 32 · duration: 0.68s (measured) · ease: unknown (rAF/JS) - verify · confidence: unknown - verify · ref: timelines/accordion-click.json
- **Navbar home link wordmark w inline block hover** (wordmark-hover) · hover · transform · layers: 13 · duration: 0.28s (measured) · ease: unknown (rAF/JS) - verify · confidence: unknown - verify · ref: timelines/wordmark-hover.json
- **Work home item link w inline block hover** (work-card-hover) · hover · transform + opacity · layers: 6 · duration: 0.65s · ease: ease.cubic-0-16-1-0-3-1 · confidence: measured · ref: timelines/work-card-hover.json
- **Navbar btn default w inline block hover** (primary-button-hover) · hover · transform · layers: 2 · duration: 0.45s · ease: ease.cubic-0-31-0-75-0-22-1 · confidence: measured · ref: timelines/primary-button-hover.json
- **Navbar links li hover** (nav-link-hover) · hover · transform · layers: 2 · duration: 0.45s · ease: ease.cubic-0-31-0-75-0-22-1 · confidence: measured · ref: timelines/nav-link-hover.json
- **Vimeo lightbox close CSS hover** (css-hover-button-vimeo-lightbox-close) · hover · transform · layers: 1 · duration: 0.5s · ease: ease.cubic-0-625-0-05-0-1 · confidence: measured · ref: timelines/css-hover-button-vimeo-lightbox-close.json
- **Partners home wrap in-view loop** (loop-0-div-partners-home-wrap) · manual · transform · layers: 7 · duration: 1.3s (measured) · ease: unknown (rAF/JS) - verify · confidence: unknown - verify · ref: timelines/loop-0-div-partners-home-wrap.json
- **G cta collection scroll callback reveal** (scroll-3-div-g-cta-collection) · scroll-reveal · css-sprite · layers: 2 · duration: 0.5s · ease: unknown · confidence: unknown - verify · ref: timelines/scroll-3-div-g-cta-collection.json
- **Work home cover scroll callback reveal** (scroll-7-div-work-home-cover) · scroll-reveal · opacity · layers: 2 · duration: 0.31s (measured) · ease: unknown (rAF/JS) - verify · confidence: unknown - verify · ref: timelines/scroll-7-div-work-home-cover.json
- **Menu links text u text style display split reveal** (split-reveal-0-div-menu-links-text-u-text-style-display) · scroll · splittext line-mask reveal · layers: 28 · duration: unknown · ease: unknown · confidence: unknown - verify
- **G link span w variant 369ea92e 73c1 eb0f a4f5 c2f13436fe88 split reveal** (split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88) · scroll · splittext line-mask reveal · layers: 78 · duration: unknown · ease: unknown · confidence: unknown - verify

## Patterns
- **p-scroll-scrub** · scroll · 4 ScrollTrigger scrub tween(s) · Registry-backed ScrollTrigger tween with scrubbed progress. · confidence: measured
- **p-scroll-callback** · scroll · 4 callback-only ScrollTrigger(s) · Callback-controlled motion. Needs timeline capture to recover from/to values. · confidence: unknown - verify
- **p-css-loop-wiggle-0-23s-steps-2** · load · 1 element(s) · 0.23s infinite CSS keyframes wiggle with steps(2). · confidence: measured
- **p-css-loop-spriteframes-0-5s-steps-4** · load · 7 element(s) · 0.5s infinite CSS keyframes spriteFrames with steps(4). · confidence: measured
- **p-css-hover-transform-0-45s-cubic-bezier-0-31-0-75-0-22-1** · hover · 3 CSS hover transition(s) · transform transition over 0.45s with cubic-bezier(0.31, 0.75, 0.22, 1). · confidence: unknown - verify
- **p-css-hover-opacity-0-3s-linear** · hover · 1 CSS hover transition(s) · opacity transition over 0.3s with linear. · confidence: unknown - verify
- **p-css-hover-all-0-5s-cubic-bezier-0-625-0-05-0-1** · hover · 1 CSS hover transition(s) · all transition over 0.5s with cubic-bezier(0.625, 0.05, 0, 1). · confidence: unknown - verify
- **p-css-hover-transform-0-65s-cubic-bezier-0-16-1-0-3-1** · hover · 1 CSS hover transition(s) · transform transition over 0.65s with cubic-bezier(0.16, 1, 0.3, 1). · confidence: unknown - verify
- **p-css-hover-opacity-0-45s-cubic-bezier-0-31-0-75-0-22-1** · hover · 1 CSS hover transition(s) · opacity transition over 0.45s with cubic-bezier(0.31, 0.75, 0.22, 1). · confidence: unknown - verify
- **p-css-hover-clip-path-transform-0-65s-0-65s-cubic-bezier-0-16-1-0-3-1-cubic-bezier-0-16-1-0-3-1** · hover · 1 CSS hover transition(s) · clip-path, transform transition over 0.65s, 0.65s with cubic-bezier(0.16, 1, 0.3, 1), cubic-bezier(0.16, 1, 0.3, 1). · confidence: unknown - verify
- **p-css-hover-transform-0-75s-cubic-bezier-0-31-0-75-0-22-1** · hover · 1 CSS hover transition(s) · transform transition over 0.75s with cubic-bezier(0.31, 0.75, 0.22, 1). · confidence: unknown - verify
- **p-css-hover-transform-opacity-0-5s-0-25s-cubic-bezier-0-31-0-75-0-22-1-cubic-bezier-0-31-0-75-0-22-1** · hover · 1 CSS hover transition(s) · transform, opacity transition over 0.5s, 0.25s with cubic-bezier(0.31, 0.75, 0.22, 1), cubic-bezier(0.31, 0.75, 0.22, 1). · confidence: unknown - verify
- **p-css-hover-transform-0-5s-cubic-bezier-0-31-0-75-0-22-1** · hover · 2 CSS hover transition(s) · transform transition over 0.5s with cubic-bezier(0.31, 0.75, 0.22, 1). · confidence: unknown - verify
- **p-css-hover-transform-0-6s-cubic-bezier-0-625-0-05-0-1** · hover · 1 CSS hover transition(s) · transform transition over 0.6s with cubic-bezier(0.625, 0.05, 0, 1). · confidence: unknown - verify
- **p-split-reveal** · scroll · 6 mapped split reveal host(s) · SplitText or line-mask reveal host detected on a ScrollTrigger page; capture by scrolling the host into view. · confidence: unknown - verify

## Polish
- **Hero home image u ratio 16 9 scroll motion** (scrolltrigger-1-0-img-hero-home-image-u-ratio-16-9) · scroll · transform · layers: 1 · duration: scroll scrub, registry tween duration 0.5s · ease: none · confidence: measured · ref: map.json#scrollTriggers[1]
- **Work home inner scroll motion** (scrolltrigger-2-0-div-work-home-inner) · scroll · transform · layers: 1 · duration: scroll scrub, registry tween duration 0.5s · ease: none · confidence: measured · ref: map.json#scrollTriggers[2]
- **Work home wrap scroll motion** (scrolltrigger-4-0-section-work-home-wrap) · scroll · transform · layers: 1 · duration: scroll scrub, registry tween duration 1s · ease: none · confidence: measured · ref: map.json#scrollTriggers[4]
- **Services home wrap scroll motion** (scrolltrigger-5-0-section-services-home-wrap) · scroll · transform · layers: 1 · duration: scroll scrub, registry tween duration 1s · ease: none · confidence: measured · ref: map.json#scrollTriggers[5]
- **Transition text u text style display CSS loop** (css-loop-0-wiggle-div-transition-text-u-text-style-display) · load · CSS keyframes · layers: 1 · duration: 0.23s infinite · ease: steps(2) · confidence: measured
- **Transition smiley u sprite CSS loop** (css-loop-1-spriteframes-div-transition-smiley-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Transition nge u sprite CSS loop** (css-loop-2-spriteframes-div-transition-nge-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Hero home deco u sprite CSS loop** (css-loop-3-spriteframes-div-hero-home-deco-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Work home inner stop u sprite CSS loop** (css-loop-4-spriteframes-div-work-home-inner-stop-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Testimonials heading backquote u sprite CSS loop** (css-loop-5-spriteframes-div-testimonials-heading-backquote-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Hero contact top left u sprite CSS loop** (css-loop-6-spriteframes-div-hero-contact-top-left-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured
- **Footer bottom deco wrap u sprite CSS loop** (css-loop-7-spriteframes-div-footer-bottom-deco-wrap-u-sprite) · load · CSS keyframes · layers: 1 · duration: 0.5s infinite · ease: steps(4) · confidence: measured

## Third-party / vendor (de-ranked)
- None detected.

## Needs verify
- **scrolltrigger-0-div-partners-home-wrap** · Callbacks: onEnter, onLeave, onEnterBack, onLeaveBack. No bound registry tween was available; capture this item for measured values.
- **scrolltrigger-3-div-g-cta-collection** · Callbacks: onEnter. No bound registry tween was available; capture this item for measured values.
- **scrolltrigger-6-callback** · Callbacks: onUpdate. No bound registry tween was available; capture this item for measured values.
- **scrolltrigger-7-div-work-home-cover** · Callbacks: onEnter, onLeave, onEnterBack, onLeaveBack. No bound registry tween was available; capture this item for measured values.
- **css-hover-0-span-navbar-btn-container** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-1-div-g-btn-container** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-2-div-vimeo-lightbox-btn** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-3-button-vimeo-lightbox-close** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-4-div-work-home-cover-deco** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-5-div-work-home-link-overlay** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-6-div-work-home-link-clip** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-7-span-accordion-css-item-contain** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-8-div-accordion-css-state** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-9-div-accordion-css-state-close-u-text-style-mono** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-10-div-accordion-css-state-text-u-text-style-mono** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-11-svg-accordion-css-item-icon-svg** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **css-hover-12-div-g-btn-container-w-variant-0cb8073d-b726-480f-f755-814264e2f505** · Timing came from static CSS transition data. Run a live capture for measured from/to deltas.
- **split-reveal-0-div-menu-links-text-u-text-style-display** · Kinds: stagger-char. Section: unknown.
- **split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88** · Kinds: stagger-char. Section: unknown.
- **split-reveal-2-div-navbar-home-link-text-u-text-style-display** · Kinds: stagger-char. Section: unknown.
- **split-reveal-3-h1-hero-home-heading-u-text-style-display** · Kinds: lines-split-mask, lines-split. Section: section.hero_home_wrap.
- **split-reveal-4-p-hero-home-p-u-text-style-large** · Kinds: lines-split-mask, lines-split. Section: section.hero_home_wrap.
- **split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f** · Kinds: stagger-char. Section: unknown.
- **split-reveal-1-div-g-link-span-w-variant-369ea92e-73c1-eb0f-a4f5-c2f13436fe88** · no animation captured
- **split-reveal-2-div-navbar-home-link-text-u-text-style-display** · no animation captured
- **split-reveal-3-h1-hero-home-heading-u-text-style-display** · no animation captured
- **split-reveal-4-p-hero-home-p-u-text-style-large** · no animation captured
- **split-reveal-5-div-g-link-span-w-variant-5fe9a928-0778-5944-e7ee-adbb3998d51f** · no animation captured
- **loop-0-div-partners-home-wrap** · Staggered 7-item animation (e.g. split text): each item transform change, ~250.4ms apart, 1.3s (measured) unknown (rAF/JS) - verify.
- **scroll-3-div-g-cta-collection** · 2 layers animate together: div.hero_contact_top-left.u-sprite [CSS sprite-sheet: 4 frames stepped via background-position]; div.hero_contact_top-left.u-sprite [CSS sprite-sheet: 4 frames stepped via background-position] - 0.5s .
- **scroll-7-div-work-home-cover** · 2 layers animate together: img.work_home_image.u-ratio-3-2 [opacity: 1 -> 0]; img.work_home_image.u-ratio-3-2 [opacity: 0 -> 1] - 0.31s (measured) unknown (rAF/JS) - verify.
- **accordion-click** · Staggered 12-item animation (e.g. split text): each item x -211.09->-241.99px, ~13.9ms apart, 0.38s (measured) unknown (rAF/JS) - verify.
- **wordmark-hover** · Staggered 13-item animation (e.g. split text): each item y 0->-31.1px, ~3.7ms apart, 0.28s (measured) unknown (rAF/JS) - verify.

## Can't spec-capture
- **remaining-hover-candidates** · Static map found 64 hover candidate(s). Captured 18; dedupe and capture representative remaining mechanisms as needed.

## Confidence counts
- measured: 17
- unknown - verify: 33
