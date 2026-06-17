# RUN LOG

- Start: 2026-06-15T01:15:39+02:00
- Output dir: /home/martin/src/perso/yoinkit/mammothmurals-codex
- Constraint: blind run; did not open docs/SPEC.md, *.animations folders, or *-baseline folders.
- Browser: agent-browser headed session via AGENT_BROWSER_SESSION=yoink.

## Phase 0 - Setup

- Read agent-browser help/core guide and capture engine API.
- Created output directory and timelines directory.

## Phase 1 - Map

- Started after setup: ran `__cap.libs()` and `__cap.map()` in the headed session.
- Saved static map to `map.json`.
- Map counts: 8 ScrollTriggers, 74 hover candidates, 15 CSS hover entries, 10 infinite CSS loops, 6 split reveal hosts, 8 sections.
- Exact/no-capture specs from map: scrubbed ScrollTriggers for hero image, work header, work/services/about section offsets; CSS loops; CSS hover transition timings.
- Needs live capture: null navbar scroll callback, partners reveal, work cover reveal, CTA collection reveal, representative nav/wordmark/button/work-card/services CTA hovers, FAQ accordion click.
- Skipped: most of the 74 hover candidates because they share the same duplicate-label button mechanism, are invisible mobile menu elements at 1280px, or are descendants of chosen scan roots.

## Phase 2 - Capture

- Rough time: about 9 minutes.
- Browser launch that worked:
  - `ENGINE=/home/martin/src/perso/yoinkit/extension/capture-animation.js`
  - `export AGENT_BROWSER_SESSION=yoink`
  - `agent-browser open https://mammothmurals.com/ --headed --args "--class=claude-mcp" --init-script "$ENGINE"`
  - `agent-browser set viewport 1280 800`
- Save pattern that worked for map and timelines:
  - `agent-browser eval 'JSON.stringify(window.__cap.map())' --max-output 1000000 > /tmp/mammoth-map.raw`
  - Parse double-wrapped eval output with Node: `JSON.parse(JSON.parse(raw))`.
  - For captures, arm `window.__cap.scan(selector,{trigger})`, drive the selector with `scrollintoview`, `hover`, or `click`, wait, then dump with `JSON.stringify(window.__cap.dump())`.
- Captures kept and referenced:
  - `nav-scroll-state`: manual scan on `header.navbar_wrap`, then `agent-browser scroll down 450`.
  - `partners-reveal`: manual scan on `div.partners_home_wrap`, then scroll into view.
  - `work-cover-reveal`: manual scan on `div.work_home_cover`, then scroll into view.
  - `cta-collection-reveal`: fresh top state, manual scan on `div.g_cta_collection`, then scroll into view.
  - `nav-link-hover`: hover scan on `a.navbar_btn_default.is-overlap`.
  - `wordmark-hover`: hover scan on `a.navbar_home_link_wordmark.w-inline-block`.
  - `primary-button-hover`: hover scan on `section.hero_home_wrap a.g_btn_main.w-inline-block`.
  - `work-card-cover-hover`: hover scan on `div.work_home_link_cover`.
  - `work-cover-hover`: hover scan on `a.work_home_contain_link.w-inline-block`.
  - `services-cta-hover`: hover scan on `a.services_home_cta.w-inline-block`.
  - `faq-accordion-click`: manual scan on `div.g_faq_item.w-dyn-item`, click first `button.accordion_css_item_top`.
  - `faq-accordion-button-click`: tight button scan while closing the same FAQ item.
- Additional reads that helped:
  - ScrollTrigger callback strings via `ScrollTrigger.getAll().map(s => String(s.vars.onEnter/onUpdate))`.
  - CustomEase paths via `CustomEase.getSVGData('ease-primary'/'ease-secondary')`.
  - CSSOM keyframes for `spriteFrames` and `wiggle`.
  - Fresh computed CTA state after `history.scrollRestoration='manual'` and reopening the URL.

### Hiccups and resolutions

- First `partners-reveal` capture used the recommended scroll trigger arming and only caught the tail end. The site's ScrollTrigger fired before the recorder's IntersectionObserver threshold. I reloaded and used manual arming before scrolling; the saved timeline is the fuller retry.
- `a.work_home_item_link.w-inline-block` captured no animation. Inspecting class locations showed the hover layers live under `div.work_home_link_cover`, and that selector captured the actual overlay and scale motion.
- `div.work_home_cover` hover mostly caught the automatic slideshow interval, not a hover. I kept the slideshow as a scroll/onEnter animation and used the separate `a.work_home_contain_link.w-inline-block` capture for the arrow CTA hover.
- CTA collection initially captured transform drift during smooth scroll. A fresh top-state computed-style read showed the true starting state: opacity 0, hidden visibility, blur(5px). The callback string confirmed the target state: scale 1, autoAlpha 1, blur(0px), ease-secondary, stagger from center.
- CustomEase function strings were opaque. `CustomEase.getSVGData()` exposed the cubic paths, which I converted to reusable tokens.
- The capture engine collapses some multi-layer findings into a stagger summary. For accordion and services CTA, I used extra tight captures and CSS map data to avoid overclaiming missing child details.

## Phase 3 - Assemble

- Rough time: about 3 minutes.
- Built `animations.json` as the canonical source from `map.json`, referenced timeline JSON files, CSSOM keyframes, callback strings, and fresh computed-style reads.
- Rendered `animations.md` directly from `animations.json` with a Node script. I did not author it separately.
- Validated all JSON with `jq empty` across `animations.json`, `map.json`, and every `timelines/*.json`.
- Removed two unreferenced exploratory timelines: the first no-animation work card capture and the noisy work-image-cover hover capture.

## Decisions

- Did not capture all 74 hover candidates. Most were descendants of already captured button/link mechanisms, hidden desktop/mobile menu elements, or duplicated class patterns. Captured representatives for nav overlap, primary CTA, wordmark character stagger, work card cover, work/view CTA, services CTA, and FAQ.
- Treated scrubbed ScrollTrigger tweens, CSS loops, and CSS transition timings as measured from registry/CSS rather than re-sampling them.
- Marked load split reveals as `unknown — verify` because they fire before a post-navigation recorder can arm.
- Marked JS callback timelines with hidden closure vars as `unknown — verify` when live samples gave timing but not readable easing/source vars.
- Marked duplicate-label hover 3D rotations as `_approx3d` because matrix decomposition gives exact translate/scale but approximate Euler rotations.

## Surprises

- The navbar scroll state moves the wordmark and nav/CTA groups dramatically after the scroll threshold, not just a small style change.
- The bottom CTA image fan is already positioned in its fan layout while hidden and blurred; the reveal primarily turns on visibility/opacity/blur, with small transform drift during smooth scroll.
- The project-card hover only fired when targeting the image-cover child, not the parent anchor selector.

## Finish

- Finish: 2026-06-15T01:31:24+02:00
- Total rough run time: about 16 minutes.

## Self-assessment

- Coverage: map found 8 ScrollTriggers, 15 CSS hover entries, 10 infinite CSS loops, 6 split reveal hosts, and 74 hover candidates. Final spec has 19 distinct animation entries, 11 reusable patterns, and 4 unspecced/skip groups.
- Live captures: 12 referenced timeline files.
- Confidence breakdown in final JSON: 9 measured, 2 `_approx3d`, 8 `unknown — verify`, 0 unreadable.
- Strongest coverage: scrubbed scroll tweens, CSS loops, primary hover systems, work-card hover, CTA/FAQ behavior.
- Known misses: exact hero load reveal timing, full video lightbox open/close, hidden mobile menu at this desktop viewport, and exhaustive duplicate hover candidates.
- With more time I would run a mobile viewport pass, open the showreel/lightbox, and use a custom pre-armed load recorder to catch hero split-line timings from navigation start.
