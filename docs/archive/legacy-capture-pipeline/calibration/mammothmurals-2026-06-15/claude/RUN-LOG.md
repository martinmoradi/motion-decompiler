# RUN-LOG — mammothmurals.com animation yoink

Agent: Claude (Opus 4.8). Driver: agent-browser 0.27.3 (one headed session, `AGENT_BROWSER_SESSION=yoink`).
Engine: `extension/capture-animation.js` injected via `--init-script`.

## Timeline
- **Start:** 2026-06-15 00:52 CEST · **Finish:** ~01:12 CEST (~20 min total)
- Phase 1 (map): 00:52 – 00:58 (~6 min)
- Phase 2 (capture): 00:58 – 01:08 (~10 min)
- Phase 3 (assemble): 01:08 – 01:12 (~4 min)

## Setup / environment
- Launched: `agent-browser open https://mammothmurals.com/ --headed --args "--class=claude-mcp" --init-script "$ENGINE"`; `set viewport 1280 800`.
- Engine injected OK (`typeof window.__cap === "object"`).
- Stack detected: **GSAP, ScrollTrigger, Lenis, Webflow, jQuery**. Classic Webflow + GSAP build with Lenis smooth-scroll. Page height 11286px.

## Phase 1 — MAP
`__cap.map()` → `map.json`. Counts: 8 scrollTriggers · 74 hoverCandidates · 15 cssHovers · 10 loops · 6 splitReveals · 8 sections.

### Sections (top→bottom)
hero_home_wrap · work_home_wrap · services_home_wrap · testimonials_home_wrap · about_home_wrap · testimonial_feature_cta · g_faq_wrap · g_cta_wrap

### ScrollTriggers (GSAP registry)
- `[1]` hero image parallax — `img.hero_home_image` y:0→125, **scrub**, ease none → MEASURED (registry)
- `[2]` work header parallax — `div.work_home_inner` y:0→-125, **scrub**, ease none → MEASURED
- `[4]` section overlap — `section.work_home_wrap` yPercent:20, **scrub** → MEASURED
- `[5]` section overlap — `section.services_home_wrap` yPercent:20, **scrub** → MEASURED
- `[0]` `div.partners_home_wrap` — onEnter/onLeave/onEnterBack/onLeaveBack, toggleActions play, no bound tween → CALLBACK (marquee start/stop). CAPTURE on scroll.
- `[3]` `div.g_cta_collection` — onEnter, no bound tween → CALLBACK reveal (CTA wheel). CAPTURE on scroll.
- `[7]` `div.work_home_cover` — onEnter/onLeave callbacks → CALLBACK reveal. CAPTURE on scroll.
- `[6]` trigger=None, start `top -300` end `max`, onUpdate → global scroll-progress callback (likely navbar/scroll-state). Structural note only.

### Loops (CSS infinite — MEASURED from CSS)
- `spriteFrames` steps(4) 0.5s — sprite-sheet 4-frame loop on many `.u-sprite` decos (smiley, nge, hero deco, work stop, testimonials backquote, contact, footer).
- `wiggle` steps(2) 0.23s — `transition_text` (page-transition overlay text).

### cssHovers (transition decls; magnitudes need capture)
Signature: `.g_btn_container` + `.navbar_btn_container` transform 0.45s cubic-bezier(0.31,0.75,0.22,…) (+`.is-duplicate` two-layer text roll). Work card: `.work_home_cover_deco` 0.65s + `.work_home_link_clip` clip-path+transform 0.65s cubic-bezier(0.16,1,0.3,1) + `.work_home_link_overlay` opacity 0.45s. Accordion: `.accordion_css_*` 0.5–0.75s + icon svg 0.6s cubic-bezier(0.625,0.05,0,1). Vimeo lightbox btn/close (polish).

### splitReveals (SplitText)
- `h1.hero_home_heading` 6 lines, `lines-split-mask` → hero headline LINE-MASK reveal (load).
- `p.hero_home_p` 8 lines, `lines-split-mask` → hero paragraph line reveal (load).
- `.menu_links_text` 28 char, `.navbar_home_link_text` 13 char, `.g_link_span` 78/28 char → per-char stagger (menu/link hover).

## Capture plan (Phase 2)
Hover: C1 primary btn `.g_btn_main` · C2 navbar btn `.navbar_btn_default` (likely == C1 mechanism) · C3 work card `.work_home_item_link` · C4 services CTA arrow `.services_home_cta` · C5 menu link `.menu_links_link` (char stagger) · C6 generic link `.g_link_text`.
Click: C7 FAQ accordion `button.accordion_css_item_top` · C8 menu open `button.navbar_menu_btn`.
Scroll reveal: C9 work cover (ST7) · C10 CTA wheel (ST3) · C11 partners marquee (ST0) · C12 generic section reveal (scan section on scroll to catch IX2/element reveals).
Structural only: U1 hero headline line-mask, U2 hero paragraph (load reveals — will attempt one live capture via reload, else structural).

### Skipped (and why)
- ~60 of 74 hoverCandidates are sub-parts of the buttons/cards/CTA already covered by C1–C6, or `#w-node-*` Webflow grid nodes with no own motion. Capturing parts individually would duplicate the parent mechanism.
- Vimeo lightbox open/close + pause btn: modal polish, read from CSS (`opacity 0.3s linear`, `all 0.5s cubic-bezier(0.625,0.05,0,1)`), not separately captured.

## Phase 2 — CAPTURE results (what worked)
Helper scripts: `_hovercap.sh` (scrollintoview → `__cap.scan(hover)` → `hover` → wait → `dump`), `_scrollcap.sh` (park above via `lenis.scrollTo(immediate)` → `scan(scroll)` → scrollintoview → dump), `_save.py` (unwraps double-quoted eval JSON → `timelines/<id>.json`).

| capture | result |
|---|---|
| primary button hover | front `.g_btn_container` scale 1→0; duplicate unfolds from 3D pose → identity. 0.45s ease.signature. _approx3d |
| navbar button hover | **same 3D-roll mechanism** (deduped into one pattern). y 44→0 + 3D rotate |
| work card hover | image tiles `scale 1.1→1`, 0.65s ease.smooth, ~129ms stagger ×5 |
| services CTA arrow | arrow+label `x -11.5→0`, 0.45s ease.signature |
| nav link hover | 13 chars `y 0→-31px`, ~14ms stagger, ~0.4s GSAP |
| footer link hover | 4 chars `y 0→-60px`, ~22ms stagger, ~0.38s GSAP |
| accordion click | content height 0→~78px + state text x10→0/op0→1 + icon rotate, 0.5s ease.signature |
| **hero load reveal** | caught live (reload + race-arm @382ms): 24 lines `y 166→0`, ~0.94s ease-out, line-mask |
| partners (ST0) | logo columns `y 0→-25px` over ~3.5s |
| work cover (ST7) | image **crossfade** (opacity 1→0 / 0→1, ~0.3s) |
| CTA wheel (ST3) | 7 images `scale 1.185→1`, ~58ms stagger, ~0.65s |
| wordmark (ST6) | **scroll-velocity drift**: x→-235px on scroll, eases back to 0 idle |
| sprite loop | spriteFrames 4 frames @8fps (sheet `…_playbtn.avif` 1434×361) |

Negative captures (honest evidence, kept in `timelines/`): `testimonials-reveal` (only the always-running backquote sprite moved), `about-reveal` / `faq-reveal` (moved:0 — no per-element scroll reveal), `work-card-clip` / `work-card-overlay` (moved:0 — CSS transition decls exist but don't fire on hover at 1280px).

## Hiccups / decisions
- **Navbar button & generic link first attempts → moved:0.** Cause: the first `.navbar_btn_default` was off-screen (page had scrolled to the work card) and the first `.g_link_text` was inside the closed mobile menu (`display:none`). Fix: scroll to top via Lenis before navbar captures; target the visible footer variant (`.g_link_text.w-variant-5fe9a928…`) for the generic link. Both then captured cleanly.
- **Stagger collapse hides sibling layers.** `dump()` collapses ≥3 transform findings to `[lead, "+N more"]`. So multi-prop interactions (work card, accordion) lose their non-lead layers in the report. Worked around by re-reading **open-vs-closed / hovered computed style directly** (accordion height + icon; confirmed work-card clip/overlay don't move).
- **Hero is a load reveal.** Instead of giving up (the prompt allows structural-only), I reloaded and armed `scan(trigger:manual)` ~382ms into load; a page-transition loader buys enough of a window to catch the full line reveal. Marked `unknown — verify` (GSAP easing unreadable).
- **ST[6] `trigger:null` mystery solved.** First scan used a wrong root (`.navbar_home_wrap` doesn't exist → engine fell back to `document.body`, noisy). Real navbar is `.navbar_wrap` (transform stays `none` → no hide-on-scroll). The onUpdate actually drives a **scroll-velocity wordmark drift**, proven by reading x at idle (→0) vs after a scroll nudge (→-235px).
- **Lenis smooth-scroll:** used `window.lenis.scrollTo(y,{immediate:true})` to park reliably; IntersectionObserver-based arming fires regardless of scroll method.
- **Menu / hamburger:** `.navbar_menu_btn` is `display:none` at 1280px (mobile-only). Skipped C8; noted in unspecced.

## Self-assessment
- **Coverage:** 8 ScrollTriggers, 10 CSS loops, 15 CSS-hover decls, 6 split-reveal hosts mapped. 13 live captures + 5 negative-result captures + 4 measured-from-registry + measured-from-CSS loops/hovers. Spec has **16 animations, 4 patterns, 4 unspecced**. Deduped ~74 hover candidates down to the distinct mechanisms (buttons, cards, arrows, char-roll links) — the rest are sub-parts/grid nodes of those.
- **Confidence breakdown:** 8 `measured`, 1 `_approx3d` (3D button rotation), 7 `unknown — verify` (GSAP/rAF easing or velocity-driven: hero reveal, CTA wheel, char-roll links ×2, wordmark drift, work-cover crossfade, partners drift).
- **Candid misses / what I'd do with more time:**
  1. **Easing on GSAP reveals.** Durations/distances measured but eases inferred from the deceleration profile only. Would diff the captured timeline against named GSAP eases (expo/power) to pin them, or read the GSAP source.
  2. **Per-line hero stagger** is reported as a noisy ~164ms average across two text blocks; would isolate the h1 vs p blocks for exact per-block stagger.
  3. **Page-transition overlay** (the brand loader) and the **mobile menu** open — not captured (navigation-timed / hidden at desktop). Would record the overlay via a navigation event hook and re-run at a mobile viewport for the menu.
  4. **Work-card clip/overlay** CSS decls don't fire at 1280px — would test other viewports / a "loaded" state to see if they ever animate.
  5. **Vimeo lightbox modal** content not opened (external embed) — read from CSS only.
