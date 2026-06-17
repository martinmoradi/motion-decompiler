# Animation spec — https://mammothmurals.com/

Captured **2026-06-15** at viewport **1280×800**. Stack: **GSAP, ScrollTrigger, Lenis, Webflow, jQuery**.

> Rendered from `animations.json`. Every value here was measured or read from the page; GSAP-driven eases that computed style can't expose are flagged `unknown — verify`. This is a spec to recreate the motion, not code.

**Method.** agent-browser (one headed Chromium session) + window.__cap capture engine (extension/capture-animation.js) injected via --init-script. Phase 1 __cap.map() static registry/CSS read; Phase 2 __cap.scan()/on() live per-frame computed-style diff while driving real hover/scroll/click by selector.

**Notes.** Webflow + GSAP build with Lenis smooth-scroll. Scrub parallax + sprite loops read from registry/CSS (measured). Hover/click/reveal motion captured live in a visible tab (headless does not advance these). GSAP-driven reveals report duration but not easing (computed style can't expose GSAP eases) -> 'unknown — verify'. 3D button rotation decomposed from matrix3d -> '_approx3d'.

## Tokens

Recurring values lifted to reusable names.

| token | value | notes |
|---|---|---|
| `ease.signature` | cubic-bezier(0.31, 0.75, 0.22, 1)  (gsap: approx power2.out / back-ish) | House ease. Buttons, CTA arrows, accordion, nav. Slight overshoot-free fast-out. |
| `ease.smooth` | cubic-bezier(0.16, 1, 0.3, 1)  (gsap: expo.out) | Strong decelerating ease. Work-card image settle, work clip transitions. |
| `ease.inOut` | cubic-bezier(0.625, 0.05, 0, 1)  (gsap: approx power3.inOut / quint.inOut) | Accordion icon rotate, vimeo-lightbox close. |
| `dur.fast` | 0.45s |  |
| `dur.smooth` | 0.65s |  |
| `dur.reveal` | ~0.94s (measured, per line) |  |
| `sprite.spriteFrames` | steps(4) | 4 frames @ 8fps.  |
| `sprite.wiggle` | steps(2) |  |

## Signature moments

Build these first — they carry the site's identity. Ordered roughly by impact.

### 1. Hero headline + paragraph line-mask reveal (load)

- **id**: `hero-line-reveal`  ·  **trigger**: `load`  ·  **mechanism**: splittext (line-mask, translateY)  ·  **confidence**: `unknown — verify`
- **locate**: `h1.hero_home_heading / p.hero_home_p (.lines-split inside .lines-split-mask)`
- **layers**: 24
- **stagger**: 23 items, ~164ms apart (avg across both blocks; per-block stagger is finer/noisy)
- **lead layer**: `div.lines-split (one line)`
    - from: transform: `translateY(166px)`
    - to: transform: `translateY(0)`
    - timing: `~0.94s` · ease: (GSAP — measured profile is a heavy ease-out, ~expo.out) · `approx cubic-bezier(0.16, 1, 0.3, 1)`
- **timeline**: `timelines/hero-load-reveal.json`
- **notes**: Captured live by reloading and arming __cap.scan(trigger:manual) ~382ms into load (a page-transition loader buys the window). Each text line sits one line-height (~166px) below, clipped by an overflow:hidden mask, and slides up. Measured deceleration: 166>123>88>48>26>17>9>2.6>0 over 937ms = strong ease-out. Per-line stagger present; exact value and easing are GSAP/rAF so not exactly readable.

### 2. Section overlap (next section slides over previous)

- **id**: `section-overlap-parallax`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (translateYPercent, scrubbed)  ·  **confidence**: `measured`
- **locate**: `section.work_home_wrap & section.services_home_wrap — ScrollTrigger[4] & [5] scrub`
- **layers**: 2
- **lead layer**: `section.work_home_wrap`
    - from: transform: `translateY(0%)`
    - to: transform: `translateY(20%)`
    - timing: `scrubbed (start 'top bottom' -> end 'top top')` · ease: none (linear to scroll) · `linear`
- **notes**: Two registry scrub tweens: as services_home_wrap enters, work_home_wrap moves yPercent 20 (ST4); as about_home_wrap enters, services_home_wrap moves yPercent 20 (ST5). Creates a layered overlap/cover-up reveal between sections.

### 3. Hero image scroll parallax

- **id**: `hero-image-parallax`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (translateY, scrubbed)  ·  **confidence**: `measured`
- **locate**: `img.hero_home_image.u-ratio-16-9 — ScrollTrigger[1] scrub`
- **layers**: 1
- **lead layer**: `img.hero_home_image.u-ratio-16-9`
    - from: transform: `translateY(0)`
    - to: transform: `translateY(125px)`
    - timing: `scrubbed (start 'top bottom' -> end 'bottom top')` · ease: none (linear to scroll) · `linear`
- **notes**: Read directly from the GSAP ScrollTrigger registry (bound tween: y 0->125, ease none, scrub true). No capture needed.

### 4. Work header counter-parallax

- **id**: `work-header-parallax`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (translateY, scrubbed)  ·  **confidence**: `measured`
- **locate**: `div.work_home_inner — ScrollTrigger[2] scrub`
- **layers**: 1
- **lead layer**: `div.work_home_inner`
    - from: transform: `translateY(0)`
    - to: transform: `translateY(-125px)`
    - timing: `scrubbed` · ease: none (linear to scroll) · `linear`
- **notes**: Registry bound tween: y 0->-125, ease none, scrub. Moves opposite the hero image for depth.

### 5. Work card image tiles settle-zoom on hover

- **id**: `work-card-image-zoom`  ·  **trigger**: `hover`  ·  **mechanism**: transform (scale)  ·  **confidence**: `measured`
- **locate**: `a.work_home_item_link (.work_home_cover_deco tiles)`
- **layers**: 6
- **stagger**: 5 items, ~129ms apart
- **lead layer**: `div.work_home_cover_deco`
    - from: transform: `scale(1.1)`
    - to: transform: `scale(1.0)`
    - timing: `0.65s` · ease: ease.smooth · `cubic-bezier(0.16, 1, 0.3, 1)`
- **timeline**: `timelines/work-card-hover.json`
- **notes**: Image tiles rest at scale 1.1 (slightly zoomed) and settle to 1.0 on hover, ~129ms staggered across ~5 tiles. CSS-transition driven (duration/ease read from computed style). The .work_home_link_clip (clip-path) and .work_home_link_overlay (opacity) carry CSS transition decls (0.65s / 0.45s) but showed NO motion on hover at this viewport (see work-card-clip.json / work-card-overlay.json, both moved:0).

### 6. Work-cover image crossfade (scroll-gated)

- **id**: `work-cover-crossfade`  ·  **trigger**: `scroll`  ·  **mechanism**: opacity  ·  **confidence**: `unknown — verify`
- **locate**: `div.work_home_cover (img.work_home_image x N) — ScrollTrigger[7] onEnter/onLeave`
- **layers**: 2
- **lead layer**: `img.work_home_image.u-ratio-3-2`
    - from: opacity: `1`
    - to: opacity: `0`, _paired: `a sibling image goes 0 -> 1 simultaneously (crossfade)`
    - timing: `~0.3s` · ease: (GSAP — not readable)
- **timeline**: `timelines/work-cover-reveal.json`
- **notes**: An image crossfade slideshow inside the work cover; one image fades out while the next fades in (~0.3s). ScrollTrigger[7] onEnter/onLeave/onEnterBack/onLeaveBack play/pause it by visibility.

### 7. Primary + nav button 3D text-roll on hover

- **id**: `3d-text-roll-button`  ·  **trigger**: `hover`  ·  **mechanism**: transform (scale + 3D rotate)  ·  **confidence**: `_approx3d`
- **locate**: `a.g_btn_main / a.navbar_btn_default (.g_btn_container + .is-duplicate)`
- **layers**: 2
- **lead layer**: `div.g_btn_container.is-duplicate (back label)`
    - from: transform: `translate3d(-6.9px,37.4px,24px) rotateX(34.4deg) rotateY(19.1deg) rotateZ(23.1deg)`, _note: `front label .g_btn_container goes scale 1 -> 0 simultaneously`
    - to: transform: `none (identity)`
    - timing: `0.45s` · ease: ease.signature · `cubic-bezier(0.31, 0.75, 0.22, 1)`
- **timeline**: `timelines/primary-button-hover.json`
- **notes**: Two captures agree (g_btn_main + navbar_btn_default share the mechanism). Front .g_btn_container scales 1->0; back .is-duplicate unfolds from a folded-back 3D pose to identity. Translate/scale exact; rotation decomposed from matrix3d (approximate). Navbar variant: y 44->0, rotateX -34.4, rotateY -19.1, rotateZ 23.1.

### 8. Final CTA image wheel staggered scale-in (scroll)

- **id**: `cta-wheel-scale-in`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (scale)  ·  **confidence**: `unknown — verify`
- **locate**: `div.g_cta_collection (.g_cta_image x7) — ScrollTrigger[3] onEnter`
- **layers**: 7
- **stagger**: 7 items, ~58ms apart
- **lead layer**: `div.g_cta_image`
    - from: transform: `scale(1.185)`, _static: `rotate(15deg) translate(-36px,-108px) held constant — that is the wheel layout, not animated`
    - to: transform: `scale(1.0)`
    - timing: `~0.65s` · ease: (GSAP — easing not readable)
- **timeline**: `timelines/cta-wheel-reveal.json`
- **notes**: 7 images arranged in a wheel (each pre-rotated ~15deg and offset) pop in by scaling 1.185 -> 1.0, ~58ms apart, as the collection enters view (GSAP ScrollTrigger onEnter callback, not a scrub tween). Only scale animates; rotate/translate are the static wheel positions.

### 9. Wordmark inertia drift on scroll velocity

- **id**: `wordmark-scroll-drift`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (translateX driven by scroll velocity + tiny skew)  ·  **confidence**: `unknown — verify`
- **locate**: `a.navbar_home_link_wordmark — ScrollTrigger[6] (trigger:null, onUpdate, start 'top -300' end 'max')`
- **layers**: 5
- **lead layer**: `a.navbar_home_link_wordmark`
    - from: transform: `translateX(0)`
    - to: transform: `translateX(up to ~-235px) then eases back to 0 when scrolling stops`
    - timing: `~0.65s settle-back` · ease: (GSAP onUpdate — velocity mapped, not fixed)
- **timeline**: `timelines/wordmark-scroll-drift.json`
- **notes**: Verified scroll-velocity-reactive, NOT a fixed marquee: idle x returns to 0 (read 0 after 1.5s no scroll), a +400px scroll snapped x to -235px. A ~0.001deg skew rides along. Magnitude depends on scroll speed. This is the only behavior of ScrollTrigger[6]'s onUpdate.

### 10. Partners logo vertical drift/cycle on enter

- **id**: `partners-logo-drift`  ·  **trigger**: `scroll`  ·  **mechanism**: transform (translateY)  ·  **confidence**: `unknown — verify`
- **locate**: `div.partners_home_wrap (.partners_logo_target) — ScrollTrigger[0] onEnter/onLeave`
- **layers**: 2
- **lead layer**: `div.partners_logo_target`
    - from: transform: `translateY(0)`
    - to: transform: `translateY(~-25px)`
    - timing: `~3.5s` · ease: (GSAP — not readable)
- **timeline**: `timelines/partners-marquee.json`
- **notes**: Logo target columns drift up ~21-25px over ~3.5s when the partners section enters; ScrollTrigger[0] play/pauses it by visibility (onEnter/onLeave/onEnterBack/onLeaveBack). Slow drift/cycle, GSAP-driven, easing not readable. Likely a logo carousel cycle.

## Patterns

Reusable utilities — implement once, apply to every instance.

### p-3d-text-roll-button

- **trigger**: `hover`  ·  **confidence**: `_approx3d`
- **applies to**: .g_btn_main / .navbar_btn_default (x many buttons sitewide)
- Two-layer button label. On hover the front label scales to 0 while a back duplicate, parked folded-back in 3D (rotateX/Y/Z + y/x offset), unfolds to identity. A 3D flip text swap.
- **instances** (measured numbers):
    - `3d-text-roll-button` — transform: `translate3d(-6.9px,37.4px,24px) rotateX(34.4deg) rotateY(19.1deg) rotateZ(23.1deg)`, _note: `front label .g_btn_container goes scale 1 -> 0 simultaneously` → transform: `none (identity)`; `0.45s` (_approx3d)

### p-char-roll-link

- **trigger**: `hover`  ·  **confidence**: `unknown — verify`
- **applies to**: nav links (.navbar_home_link_contain), inline/footer links (.g_link_text), menu links (.menu_links_link)
- SplitText per-character roll: each char translates up by ~1 line-height (a duplicate rolls in from below), staggered ~14-22ms across the word. GSAP-driven, easing not readable from computed style.
- **instances** (measured numbers):
    - `nav-link-char-roll` — transform: `translateY(0)` → transform: `translateY(-31.1px)`; `~0.40s`, stagger ~14ms (unknown — verify)
    - `footer-link-char-roll` — transform: `translateY(0)` → transform: `translateY(-60px)`; `~0.38s`, stagger ~22ms (unknown — verify)

### p-sprite-loop

- **trigger**: `load`  ·  **confidence**: `measured`
- **applies to**: .u-sprite decorations (smiley, nge, hero deco/play-btn, work stop, testimonials backquote, contact, footer) (x10)
- CSS sprite-sheet loop: background-position stepped through 4 frames at ~8fps, infinite (animation spriteFrames 0.5s steps(4)). A separate 'wiggle' steps(2) 0.23s drives the page-transition text.
- **instances** (measured numbers):
    - `sprite-loops` — backgroundPosition: `0px 0px` → backgroundPosition: `cycles -717px / -1075.5px / 0px / -358.5px`; `0.5s loop (steps(4), ~8fps)` (measured)

### p-scrub-parallax

- **trigger**: `scroll`  ·  **confidence**: `measured`
- **applies to**: hero image, work header, section overlaps (x4 GSAP ScrollTrigger scrub tweens)
- Scroll-scrubbed parallax (ease:none, linear to scroll). Foreground/background layers translate at different rates; sections overlap by sliding yPercent as the next section enters.
- **instances** (measured numbers):
    - `hero-image-parallax` — transform: `translateY(0)` → transform: `translateY(125px)`; `scrubbed (start 'top bottom' -> end 'bottom top')` (measured)
    - `work-header-parallax` — transform: `translateY(0)` → transform: `translateY(-125px)`; `scrubbed` (measured)
    - `section-overlap-parallax` — transform: `translateY(0%)` → transform: `translateY(20%)`; `scrubbed (start 'top bottom' -> end 'top top')` (measured)

## Polish (table-stakes)

#### Services CTA arrow nudge on hover

- **id**: `services-cta-arrow`  ·  **trigger**: `hover`  ·  **mechanism**: transform (translateX)  ·  **confidence**: `measured`
- **locate**: `a.services_home_cta (.services_home_cta_arrow + text)`
- **layers**: 6
- **stagger**: 4 items, ~0ms apart (simultaneous)
- **lead layer**: `div.services_home_cta_arrow.u-text-style-display`
    - from: transform: `translateX(-11.5px)`
    - to: transform: `translateX(0)`
    - timing: `0.45s` · ease: ease.signature · `cubic-bezier(0.31, 0.75, 0.22, 1)`
- **timeline**: `timelines/services-cta-arrow-hover.json`
- **notes**: Arrow + label slide right ~11.5px on hover (CSS transition; duration/ease from computed style).

#### FAQ accordion expand/collapse on click

- **id**: `accordion-expand`  ·  **trigger**: `click`  ·  **mechanism**: height + transform + opacity (+ icon rotate)  ·  **confidence**: `measured`
- **locate**: `div.g_faq_item — click button.accordion_css_item_top`
- **layers**: 7
- **lead layer**: `div.accordion_css_item_bottom / .accordion_css_bottom_wrap (content)`
    - from: height: `0px`, overflow: `hidden`, _state: `.accordion_css_state at translateX(10px) opacity 0; icon at rest`
    - to: height: `auto (~78px content)`, _state: `.accordion_css_state to translateX(0) opacity 1; icon rotates`
    - timing: `0.5s (state) / 0.75s (contain) / 0.6s (icon)` · ease: ease.signature · `cubic-bezier(0.31, 0.75, 0.22, 1)`
- **timeline**: `timelines/accordion-expand.json`
- **notes**: Class-toggle accordion (no checkbox). On open: content wrapper height 0 -> content (overflow hidden), the open/close state label slides in (x 10->0) and fades (0->1) over 0.5s/0.25s, the +/- icon rotates (0.6s ease.inOut cubic-bezier(0.625,0.05,0,1)). Open/closed computed values read directly. Lead captured value was the state x-slide; height + icon read from open-vs-closed computed style.

#### Vimeo lightbox button + close (polish)

- **id**: `vimeo-lightbox`  ·  **trigger**: `hover`  ·  **mechanism**: opacity / all  ·  **confidence**: `measured`
- **locate**: `div.vimeo-lightbox__btn / button.vimeo-lightbox__close`
- **layers**: 2
- **lead layer**: `div.vimeo-lightbox__btn`
    - from: opacity: `rest`
    - to: opacity: `hover`
    - timing: `0.3s (btn) / 0.5s (close)` · ease: linear (btn) / ease.inOut (close) · `linear / cubic-bezier(0.625, 0.05, 0, 1)`
- **notes**: Read from CSS transition declarations only (map cssHovers); the lightbox modal itself was not opened/captured. btn opacity 0.3s linear; close 'all' 0.5s cubic-bezier(0.625,0.05,0,1).

## Needs verify

Motion measured, but a value can't be read precisely from the page (GSAP/rAF easing, velocity-driven, or 3D-decomposed). Confirm against source if recreating exactly.

| id | confidence | what to verify |
|---|---|---|
| `hero-line-reveal` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `3d-text-roll-button` | `_approx3d` | translate/scale exact; **3D rotation** decomposed from matrix3d (approx) |
| `cta-wheel-scale-in` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `wordmark-scroll-drift` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `work-cover-crossfade` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `nav-link-char-roll` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `footer-link-char-roll` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |
| `partners-logo-drift` | `unknown — verify` | duration measured; **easing** is GSAP/rAF (not in computed style) |

## Can't spec-capture

- **page-transition-overlay** — Brand page-transition/preloader overlay (transition_text 'wiggle' steps(2) 0.23s + transition_smiley / transition_nge sprite characters spriteFrames steps(4) 0.5s). Fires on navigation/initial load before the app is interactive; mechanism is known from CSS loops but the timed in/out of the overlay itself was not captured. The hero-line-reveal was caught just after it.
- **hero-video / vimeo-lightbox-modal** — Hero has a play button (sprite) opening a Vimeo lightbox modal. Modal open/close transitions read from CSS only (see vimeo-lightbox); modal content not opened/captured (external embed).
- **menu-open (mobile)** — Fullscreen menu (.menu_links, .navbar_menu_btn) is display:none at 1280px (mobile-only hamburger). Its char-stagger link reveals (.menu_links_text x28) follow p-char-roll-link. Not triggerable at desktop viewport; not captured.
- **work-card-clip/overlay** — .work_home_link_clip (clip-path inset, 0.65s) and .work_home_link_overlay (opacity, 0.45s) have CSS transition declarations but produced no measured motion on hover at 1280px (both captures moved:0). Either gated by a state we did not reach or visually negligible. Worth verifying.
