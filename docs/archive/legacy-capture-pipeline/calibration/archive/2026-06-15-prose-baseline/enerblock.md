# Calibration report — enerblock.net (non-Mammoth)

- **Date:** 2026-06-15
- **Target:** https://enerblock.net/en/
- **Browser session:** `motion-claude-enerblock` (repo wrapper `bin/capture-browser`, headed)
- **Purpose:** Does YoinkIt generalize beyond mammothmurals.com? Treated as product calibration. No source tuning for this site.

## Headline

The pipeline generalized well. Scout detected the real stack (GSAP + ScrollTrigger + Lenis), proposed a sane 4-capture manifest, and the full yoink ran to completion (exit 0) even though 2 of 4 live captures failed. Failures were recorded as `status:"error"` / `status:"empty"` with human-readable reasons, and the run kept going — exactly the soft-fail behavior we want. The assembled spec (`animations.md`) is genuinely useful: it merges the live captures with the 8 ScrollTrigger registry tweens and the split-reveal host into one agent-ready document with confidence labels.

No hard failure. Nothing to "stop and report" on.

## Run facts

| Item | Value |
| -- | -- |
| Run directory | `runs/enerblock.net/2026-06-15-claude-enerblock-2` |
| Smoke result | **ok: true**, all 21 checks pass, exit 0 |
| `node --check` engine + CLI | both OK |
| Stack detected | **GSAP, ScrollTrigger, Lenis** |
| Map counts | ScrollTriggers 8 · hover candidates 20 · CSS hovers 0 · loops 0 · split reveals 1 |
| Proposed captures | **4** (1 boot, 3 hover); **1 skipped** at plan time (`hover-a`, generic tag too broad) |
| Capture results | **4** |

### Capture status counts

| Status | Count | Captures |
| -- | -- | -- |
| ok | **2** | `boot-load-reveals`, `primary-button-hover` |
| check | **0** | — |
| empty | **1** | `link-hover` |
| error | **1** | `arrow-row-hover` |
| skipped | **1** | `hover-a` (dropped at plan stage, never entered the manifest) |

`skipped` is counted from `capture-plan.json` (plan-time drop), not from `capture-results.json` (which only holds the 4 captures that were actually attempted).

## Top 8 signature animations (`animations.md`)

1. **A link button link button full hover** (`primary-button-hover`) · hover · transform · 4 layers · **0.6s · cubic-bezier(0.53, 0, 0, 1)** · confidence: measured. Staggered split-text + icon: each item `y 0 -> 15.09px`, ~11.1ms apart. *(Best, cleanest result of the run.)*
2. **Boot/load split reveal** (`boot-load-reveals`) · boot · height + opacity · 9 layers · 0.26s (measured) · ease unknown (rAF/JS) — verify.
3. **Pretitle content split reveal** (`split-reveal-0-span-pretitle-content`) · load · splittext line-mask reveal · 176 layers · duration/ease unknown — verify.
4. **Scroll frames** (`scrolltrigger-0`) · scroll · frame · scrub, registry tween 0.5s · ease none · measured. *(Hero frame-sequence scrub, `frame:120`.)*
5. **Scroll frames tt-ab** (`scrolltrigger-1`) · scroll · frame · scrub, 0.5s · none · measured. *(`frame:144`.)*
6. **Home video tt-ab** (`scrolltrigger-2`) · scroll · transform · `y:114` · scrub, 0.5s · none · measured.
7. **Image-back parallax** (`scrolltrigger-3`) · scroll · transform · `y:33` · scrub, 0.5s · none · measured.
8. **Image parallax** (`scrolltrigger-4`) · scroll · transform · `y:130` · scrub, 0.5s · none · measured.

(Also present: footer parallax `yPercent`, footer overlay `opacity:0`, text-float `y:0` — entries 9–11.)

Patterns block: `p-scroll-scrub` (8 ScrollTrigger scrub tweens, measured) and `p-split-reveal` (1 host, verify). Confidence counts: **measured 9, unknown-verify 3.**

## Failed / empty captures and likely reasons

- **`arrow-row-hover` → error.** `Preflight failed for hover div.carousel__arrow.carousel__arrow--prev: selector center is covered by div.carousel__control`. The carousel arrow sits underneath a `div.carousel__control` overlay, so the hover point isn't hittable. The preflight hit-test caught it and the CLI recorded the error and continued. **Correct behavior** — this is the soft-fail path working.
- **`link-hover` → empty.** Selector `a.link--underline` resolved fine (4 matches, all visible) and preflight reported it hittable, but the chosen instance was `a.menu__item__link.link--underline` at `(879, 400)` — a nav/menu link. Hovering produced **0 moved layers**. Likely an underline effect that is pure CSS (map reported `cssHovers: 0`, so no JS hover timing existed to capture) and/or the representative instance lives in a menu context where the underline transition isn't measurable per-frame. A timeline file was still written (just empty). Report's "Empty Captures" note suggests the right next steps (tighter selector / visible start state / manual recipe).

Both successes are worth calling out: `boot-load-reveals` captured the pretitle split reveal (9 layers, height/opacity, 0.26s) and `primary-button-hover` captured a clean measured staggered hover with a real cubic-bezier.

## Was the output useful for recreating the site's motion?

**Yes, substantially — with honest gaps.** A coding agent handed `animations.md` would have:

- One fully-specified, recreatable hover (button: 0.6s `cubic-bezier(0.53,0,0,1)`, 4-layer split-text stagger ~11ms, `y 0→15px`).
- The full parallax/scroll system documented from the GSAP registry: 8 scrubbed ScrollTriggers with named targets (`div.image--parallax`, `div.footer__parallax`, etc.), props (`y`, `yPercent`, `opacity`, `frame`), 0.5s tween durations, `ease none`, scrub on. Enough to rebuild the parallax feel.
- A flagged split-text hero reveal (176 word/char nodes) and a clear "needs verify" list so the agent knows what's measured vs. inferred.

Gaps that limit a 1:1 rebuild:
- The two hero `frame:120`/`frame:144` scroll tweens have `targets:[null]` — the spec knows a frame-sequence scrub exists but not which element drives it (likely a canvas/image-sequence). An agent would have to inspect that manually.
- Boot reveal ease is `unknown (rAF/JS)`, and its findings are a bit noisy (9× `span.pretitle.content`, some `opacity 1→0` which reads like mask/teardown rather than the reveal-in). Useful as a pointer, not a precise spec.
- 2 of 4 live hover captures yielded nothing usable, so non-scroll micro-interactions are under-covered.

Net: strong for the scroll/parallax system and the one good hover; partial for boot reveal; weak coverage of the long tail of 20 hover candidates (only 4 attempted, by design — flagged under "Can't spec-capture / remaining-hover-candidates").

## Generic product issues vs. site-specific weirdness

**Generic product issues (would recur on other sites):**
- **Planner doesn't pre-validate hover-target hittability.** It proposes representative hover selectors purely from the static map; occlusion is only discovered at capture time (the `arrow-row-hover` overlay case). Matches the existing memory note `capture-failures-soft-fail`. The soft-fail handling is correct, but the planner could pre-filter covered/occluded targets to spend captures better.
- **Representative-selector dedup can pick a non-animating / wrong-context instance.** `link-hover` deduped 20 candidates down to `a.link--underline` and landed on a menu link with no measurable motion. Dedup optimizes for "representative selector," not "instance most likely to actually animate."
- **No live scroll capture is ever proposed.** Despite 8 ScrollTriggers, the plan had zero `scroll` captures; scroll motion is sourced entirely from the GSAP registry (measured) and never live-verified per-frame. Reasonable default, but the scrub animations are never confirmed against real frames, and `frame`-type tweens with null targets stay unresolved.
- **Boot/split-reveal ease is reported as `unknown (rAF/JS)`.** Inferring GSAP SplitText easing from frame sampling is inherently hard; this will be "verify" on most GSAP sites, not just this one.

**Site-specific weirdness:**
- **`<a-link>` custom-element tag.** enerblock uses custom elements, so the map emitted selectors like `a-link.button__link.button--full`. This looked malformed at first glance but is **correct** — the selector resolved (matchCount 1, visible) and the hover captured cleanly. Good signal that the engine's selector synthesis is robust to custom elements.
- **Carousel arrow occluded by `div.carousel__control`.** Specific to this site's carousel DOM.
- **Hero is a scroll-scrubbed frame sequence** (`frame:120`/`frame:144`, null targets) rather than CSS/transform parallax — specific to this build and the reason those two entries are less actionable.

## Signs the planner is overfit to Mammoth

**Confirmed present, but inert for this site.** Grepping `bin/yoinkit` (read-only) shows hardcoded Mammoth/Webflow class literals baked into the scoring/dedup heuristics:
- `work-card-hover` rule: `/work.*(item|card|cover|link)|work_home/` → priority 10 (line ~1170).
- Dedup penalties for `w-inline-block|g_btn_main|services_home_cta|work_home_item_link|navbar_btn_default` (line ~1186).
- Mammoth-specific overlay dedup `work_home_(cover_deco|link_overlay|link_clip|aside_arrow|link_cover)` (lines ~1207–1208).
- Accordion/FAQ inference keyed on `/accordion|faq/i`, with usage examples citing `div.g_faq_item.w-dyn-item` and `a.work_home_item_link`.

For enerblock **none of these matched** any selector, so they neither helped nor mis-targeted — the proposed manifest was 100% enerblock-native (`button__link`, `carousel__arrow`, `link--underline`, `pretitle`). So the overfit is *additive* (extra Mammoth-tuned heuristics) rather than *destructive* here. This is consistent with the memory note `planner-overfit-mammoth-selectors`: the hazard is on other **Webflow** sites where the broad `work.*item` / `accordion|faq` regexes or the FAQ literal could mis-fire. enerblock being GSAP/Lenis (not Webflow) sidestepped it. The Mammoth literals contributed zero value to this non-Mammoth run, which argues for eventually generalizing them into structural heuristics.

## Source files modified

**None.** All work was read/run only.

`git status --short` is identical to the start-of-run snapshot:
```
 M README.md
 M bin/yoinkit
 M tests/run-smoke.sh
?? prompt.md
```
Those three `M` files were already modified before this calibration began (pre-existing uncommitted CLI/readiness work — `--ready-timeout-ms`, `--capture-strategy`, etc.); I ran against the working-tree version as-is and did not touch them. `runs/` is gitignored, so the run artifacts don't appear. The only new file from this task is this report (`calibration-reports/enerblock.md`).

Browser sessions: none left open (the yoink step closes with `capture-browser close --all`; a follow-up `close --all` confirmed "No active sessions").
