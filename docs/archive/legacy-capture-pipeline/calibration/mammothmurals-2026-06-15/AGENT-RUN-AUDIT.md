# Blind Run Audit: Claude Opus 4.8 vs GPT-5.5 Codex

Date: 2026-06-15

Subject: two blind executions of `yoink-run-prompt.md` against `https://mammothmurals.com/`.

Compared outputs:

- Claude Opus 4.8: `claude/`
- GPT-5.5 Codex: `mammothmurals-codex/`

I treated this as both a task-compliance audit and a product audit for this repo. The question is not only "who wrote a better animation report?" but also "which run better exposes what `YoinkIt` should become?"

## Verdict

Codex performed better overall for this codebase.

The Codex run is the stronger canonical deliverable: broader coverage, more reusable pattern extraction, better use of ScrollTrigger callback inspection, better tokenization of actual custom eases, and more useful multi-layer captures for work-card, arrow, CTA, and accordion behavior. If I had to hand one folder to a recreation agent, I would hand over `mammothmurals-codex/`.

Claude performed better as a field notebook and capture-method explorer. It saved helper scripts, preserved negative captures, wrote a richer human report, and did one especially valuable thing Codex did not: it race-armed a reload and actually captured the hero load reveal. That is an important discovery for the prompt and engine roadmap.

Short version:

- Best final spec: Codex.
- Best live-capture initiative: Claude.
- Best implementation feedback for this repo: both converge on the same two big fixes, but Claude explains the failure modes more concretely.
- Best prompt-following as a clean deliverable: Codex, with one caveat that it did not save the report-rendering script.

## Hard Evidence

Both runs produced valid JSON for `animations.json`, `map.json`, and all timelines. Both mapped the same static page structure:

- 8 ScrollTriggers
- 74 hover candidates
- 15 CSS hover entries
- 10 infinite CSS loops
- 6 split reveal hosts
- 8 sections

Output shape:

| Area | Claude | Codex |
|---|---:|---:|
| `animations[]` | 16 | 19 |
| `patterns[]` | 4 | 11 |
| `unspecced[]` | 4 | 4 |
| timeline refs in `animations.json` | 12 | 11 |
| missing timeline refs | 0 | 0 |
| unreferenced timelines | 6 | 1 |
| measured entries | 8 | 9 |
| approx 3D entries | 1 | 2 |
| verify entries | 7 | 8 |

This count does not mean Codex simply "captured more." It also decomposed the site into smaller reusable patterns. That is useful because the consuming agent wants reusable motion systems, not one giant list of one-off observations.

## Where They Converged

Both agents understood the target architecture:

- Use `__cap.map()` first.
- Treat scrubbed ScrollTrigger tweens as measured from the registry.
- Treat CSS sprite loops and CSS hover timings as measured without live capture.
- Live-capture event-bound hovers, callback ScrollTriggers, and the FAQ accordion.
- Dedupe most of the 74 hover candidates.
- Mark hidden mobile menu behavior as not capturable at the required desktop viewport.
- Leave video/lightbox behavior incomplete.
- Identify the same stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery.

Both also found the same core animation families:

- Hero split-line load reveal.
- Sprite sheet loops and transition text wiggle.
- Scroll-scrub parallax for hero image, work header, and section offsets.
- Button duplicate-label 3D hover.
- Character-stagger link hover.
- Work-card hover.
- Services/work arrow hover.
- Scroll-triggered CTA image fan.
- Partners logo motion.
- Work-cover image crossfade.
- FAQ accordion.
- Navbar or wordmark scroll state.

That convergence is a good sign for the prompt and the engine. Independent blind agents found the same skeleton.

## Key Divergences

### 1. Hero load reveal

Claude did better.

The prompt says load reveals are hard and can be recorded structurally. Claude went beyond that, reloaded, armed `scan(trigger:manual)` roughly 382ms into load, and captured `hero-load-reveal.json`. This produced measured distance and timing for the line-mask reveal.

Codex kept the hero load reveal structural and marked it as needing verification. That is acceptable under the prompt, but less valuable.

Prompt lesson: the load-reveal section should include a best-effort race-arm recipe.

Engine lesson: add a first-class boot recorder for load animations.

### 2. Custom eases and callback inspection

Codex did better.

Codex inspected callback strings and used `CustomEase.getSVGData()` to extract:

- `ease-primary`: `cubic-bezier(0.87, 0, 0.13, 1)`
- `ease-secondary`: `cubic-bezier(0.31, 0.75, 0.22, 1)`
- CTA reveal callback facts such as `scale:1`, `autoAlpha:1`, `filter:"blur(0px)"`, and `stagger:{from:"center"}`

Claude mostly inferred or approximated these eases from computed style and timeline shape. It correctly recognized the house ease behavior, but Codex preserved more source-level truth.

Codebase lesson: the tool should not be only a computed-style sampler. For GSAP sites, it should opportunistically instrument or inspect GSAP.

Prompt lesson: explicitly tell runners to inspect callback function strings and `CustomEase` data when available.

### 3. Work-card hover

Codex did better.

Claude captured the repeated image tile scale and concluded the clip and overlay did not move at 1280px. It kept negative captures for `work-card-clip` and `work-card-overlay`.

Codex targeted the better root, `div.work_home_link_cover`, and captured three layers together:

- deco scale `1.1 -> 1`
- overlay opacity `0 -> 0.8`
- clip scale `1 -> 0.8`

This is a more complete animation spec.

Tooling lesson: `scan()` is right, but selector choice still matters. The capture plan should favor the tight visual root, not only the anchor.

### 4. CTA image fan

Codex did better.

Claude measured scale `1.185 -> 1` and correctly separated static wheel translate/rotation from animated scale.

Codex captured the scroll drift but then did a fresh top-state computed-style read and callback inspection, identifying hidden initial state: opacity 0, visibility hidden, blur(5px), then `autoAlpha:1`, `filter:"blur(0px)"`, scale 1, stagger from center.

This is better for recreation. The visual reveal is not just scale.

### 5. Navbar scroll state

Mixed result.

Claude framed the behavior as "wordmark scroll-velocity drift" and did useful idle-vs-scroll reasoning. That is a better conceptual warning: the magnitude depends on scroll velocity and should not be recreated as a fixed one-shot tween.

Codex read more of the callback behavior and reported movement of nav link group, wordmark, and CTA groups after the scroll threshold. That is broader source evidence.

Best synthesis: Codex found more targets; Claude better warned that the behavior is velocity-reactive.

### 6. Accordion

Mixed, leaning Codex.

Claude marked the accordion measured and described content height, state label transform/opacity, and icon rotate. It also noted that the engine collapsed multi-layer findings and it had to re-read computed state manually.

Codex was more cautious, marking the accordion as needing verification, but captured tighter evidence including close-label motion and CSS icon timing.

For this codebase, the important point is not which label is better. Both exposed the same engine flaw: the current analyzer loses multi-property and non-lead layer details.

### 7. Report quality and reproducibility

Claude did better on provenance.

Claude saved `_assemble.py`, `_render.py`, `_save.py`, `_hovercap.sh`, and `_scrollcap.sh`. Its `animations.md` is long, but it is clearly generated from the JSON and the rendering script is present.

Codex wrote a concise `animations.md` and says it rendered it from JSON with a Node script, but the script was not saved. The report is easier to skim, but less reproducible.

Prompt lesson: require saving the render script or a one-command regeneration path.

## What Both Failed Or Left Weak

### No mobile pass

Both runs stayed at 1280x800, as prompted. That means the mobile menu was correctly unspecced, but the task title says "every animation on a web page." Desktop-only cannot satisfy that for responsive sites.

The prompt should decide explicitly:

- desktop pass only, or
- desktop plus mobile pass, with separate viewport metadata.

I would add an optional second pass at `390x844` for mobile menu and mobile-specific layout motion.

### No full video/lightbox flow

Both only mapped control hover timings or left modal behavior unspecced. This is reasonable because opening embedded media adds state, external playback UI, and possible cross-origin complexity. Still, if "every animation" includes modal open/close, the prompt needs a specific lightbox recipe.

### No machine-readable capture plan

Both wrote capture decisions into `RUN-LOG.md`. Neither produced a required `capture-plan.json`.

This is a big gap for this repo. The core workflow is map -> plan -> capture -> assemble, but the plan is not a first-class artifact. Without it, you cannot automatically audit skipped candidates, replay captures, or compare agents fairly.

I would add:

```json
{
  "found": [],
  "selected": [],
  "skipped": [],
  "captures": [
    {
      "id": "work-card-cover-hover",
      "selector": "div.work_home_link_cover",
      "trigger": "hover",
      "status": "captured",
      "timelineRef": "timelines/work-card-cover-hover.json",
      "reason": "representative project-card visual root"
    }
  ]
}
```

### Ambiguous selectors

Both outputs still use selectors like `div.g_cta_image`, `img.work_home_image.u-ratio-3-2`, and `div.g_btn_container`, which are not always sufficient to locate the intended element. This is inherited from `cssPath()`.

The schema says "how to LOCATE it." The engine should emit both:

- `shortSelector` for readability.
- `locator` for replay, with stable ancestor chain or nth-child disambiguation.

### Incomplete confidence vocabulary

Both runs had to flatten mixed evidence into `measured`, `unknown verify`, or `_approx3d`. That loses nuance.

Examples:

- Codex had exact callback vars but sampled timing.
- Claude had exact CSS timing but approximate GSAP profile.
- Accordion has exact CSS timings for some child layers but sampled or inferred height behavior.

I would add `confidenceReasons[]` rather than inventing many new labels.

Example:

```json
"confidence": "unknown-verify",
"confidenceReasons": [
  "duration sampled from live timeline",
  "target state read from callback string",
  "easing name read from CustomEase",
  "height curve sampled, not source-read"
]
```

### No reverse-direction standard

Both mainly captured enter/open/hover-in. Hover-out, accordion close, scroll leave/back, and reverse eases can differ. Codex did one extra accordion close/button capture, but the output contract does not model directions cleanly.

The schema should support:

```json
"directions": {
  "enter": { "...": "..." },
  "leave": { "...": "..." }
}
```

### Raw data is too lossy

Both agents hit the same engine issue: `dump()` collapses findings when it sees a stagger summary. That makes the report neat but loses data. Claude explicitly had to work around this for accordion and work-card details. Codex got a better work-card capture, but the underlying risk remains.

The engine should preserve all changed layers and put summaries beside them, not instead of them.

## Codebase Improvement Angles

These are the changes I would make in this repo, in priority order.

### 1. Preserve full multi-property findings

Right now `analyze()` effectively picks the first changed property per element, and `dump()` can collapse multiple findings into a summary. That is the single most visible technical limitation.

Change the finding shape from "one property won" to "all changed tracks":

```json
{
  "selector": "div.g_cta_image",
  "leadProperty": "transform",
  "properties": {
    "transform": { "from": "...", "to": "...", "timeline": [] },
    "opacity": { "from": "0", "to": "1", "timeline": [] },
    "filter": { "from": "blur(5px)", "to": "blur(0px)", "timeline": [] }
  }
}
```

Then let the renderer choose a lead. Never discard the rest.

### 2. Add GSAP instrumentation

This is the highest-ceiling improvement.

Since the engine is injected with `--init-script`, it can wrap or observe GSAP creation:

- `gsap.to`
- `gsap.from`
- `gsap.fromTo`
- `gsap.timeline`
- timeline `.to/.from/.fromTo`

During a capture window, log target elements, vars, duration, ease, stagger, and callback-created tweens. Cross-reference logged tweens with changed DOM elements.

This would convert many "verify" cases into measured or source-read cases, especially hovers and ScrollTrigger callbacks.

### 3. Add a boot/load recorder

Claude proved that load reveals can be captured when a loader delays the reveal. The engine should make that reliable.

Potential API:

```js
__cap.boot({
  selectors: ["h1", "p", "[class*=split]", "[class*=hero]"],
  ms: 4000
})
__cap.bootDump()
```

Because `--init-script` runs before page scripts, this is a natural fit for the repo.

### 4. Emit better locators

Improve `cssPath()` or add a new locator helper:

- prefer IDs and unique classes when available,
- include nearest stable section ancestor,
- include nth-child only when needed,
- include visible text snippet for links/buttons,
- store match count and visibility.

Example:

```json
{
  "shortSelector": "div.g_btn_container",
  "locator": "section.hero_home_wrap a.g_btn_main:nth-of-type(1) div.g_btn_container",
  "matchCount": 12,
  "visibleMatchCount": 3
}
```

### 5. Prefer visible matches in `resolve()`

Claude lost time because first matches were hidden or off-screen. Make `resolve()` prefer elements with:

- non-zero bounding box,
- visible computed style,
- not `display:none`,
- not inside hidden mobile/menu containers unless requested.

This is a small change with high reliability impact.

### 6. Store termination reason and raw frames

For each capture, record:

- `terminationReason`: `settled`, `maxDuration`, `manual`, `interrupted`
- `sampleCount`
- full raw frames or a path to raw frames
- downsampled report timeline separately

Velocity-driven and looping effects are easy to misread without this.

### 7. Add easing estimation as labeled evidence

When the source cannot expose an ease, fit sampled progress against a small library of common curves. Keep it clearly labeled as estimated.

This would make recreation more useful without pretending to know source truth.

### 8. Add pseudo-state CSS hover support

For CSS hovers, live capture is useful but not always necessary. A CDP helper that forces `:hover` and reads before/after computed style would make CSS transitions more deterministic.

### 9. Support directional captures

Add recipes and schema support for:

- hover in and hover out,
- accordion open and close,
- scroll enter, leave, enterBack, leaveBack.

### 10. Move from logs to replayable artifacts

Keep `RUN-LOG.md`, but also require:

- `capture-plan.json`
- `commands.jsonl` or equivalent command trace
- saved render script or `renderCommand`
- optional `evidence.json` with callback strings, CustomEase paths, CSS keyframes, and computed-state reads

That would let this repo compare future agents objectively.

## Prompt Improvement Angles

The prompt is already strong. It did the most important thing: it forced both agents into the same phase structure and output contract. I would improve it in these ways:

1. Require `capture-plan.json`.
2. Require saving the Markdown renderer or regeneration command.
3. Add a best-effort load reveal recipe based on reload plus immediate manual scan.
4. Explicitly ask for callback string inspection and `CustomEase.getSVGData()` when GSAP is present.
5. Explain how to detect hidden first matches and choose visible selectors.
6. Require a "negative captures" section or artifact. Claude kept them; Codex mostly cleaned them. Both are useful in different ways.
7. Define whether desktop-only is the intended scope. If not, add a second mobile viewport pass.
8. Define how to model velocity-driven effects. They are not fixed timelines.
9. Add confidence provenance instead of relying only on one flat confidence label.
10. Add reverse-direction capture requirements for hover, accordion, and scroll callbacks.

## Assessment Of Each Agent

### Claude Opus 4.8

Strengths:

- More inventive during capture.
- Captured the hero load reveal despite the prompt treating it as structurally hard.
- Preserved helper scripts and negative timelines.
- Wrote a strong process log with real debugging detail.
- Produced a very rich `animations.md`.
- Its assessment is tightly grounded in engine source limitations.

Weaknesses:

- Final canonical spec is less complete than Codex.
- Only 4 patterns, which underuses the pattern system.
- Work-card hover missed overlay and clip motion in the final spec.
- Custom eases are more inferred than source-read.
- Several unreferenced exploratory timelines make the folder noisier.
- The report is long enough that it is less convenient as a handoff artifact.

Best improvement angle for Claude-like agents:

- Keep the experimental capture instinct, but force a second assembly pass that consolidates evidence into a tighter canonical schema.

### GPT-5.5 Codex

Strengths:

- Better final `animations.json`.
- More complete pattern taxonomy.
- Better callback and CustomEase extraction.
- Better multi-layer capture for work-card, arrow, CTA, and accordion-related behavior.
- Better concise `animations.md`.
- Cleaner folder with fewer dangling artifacts.
- Stronger recommendations around first-class artifacts like `capture-plan.json`.

Weaknesses:

- Did not capture the hero load reveal live.
- Did not save the report rendering script it claimed to use.
- Some entries lean on source/callback evidence while still marked broadly as verify, so confidence provenance is muddy.
- The concise Markdown report loses some of the helpful field context that Claude preserved.
- It may over-split patterns into many pattern entries, which is useful for audit but could be simplified for a recreation agent.

Best improvement angle for Codex-like agents:

- Add a "field capture retry" step before assembly, especially for load reveals and mobile-hidden interactions, and save every generation script needed to reproduce the deliverables.

## What I Would Do Next

If I were evolving this repo, I would make three changes first:

1. Implement full multi-property findings and stop collapsing layer data.
2. Add a GSAP capture logger that records event-created tweens during `scan()`.
3. Add `capture-plan.json` to the prompt and output contract.

Then I would add the boot/load recorder, visible-match selector resolution, and mobile pass.

The deeper product direction is clear: `YoinkIt` should combine black-box behavioral sampling with opportunistic white-box framework evidence. The blind runs prove that sampling alone gets the shape, but GSAP inspection gets the truth that matters for a recreation agent: target state, named ease, duration, stagger, and callback intent.

## Final Ranking

1. Codex: better final artifact and better fit for this repo's next iteration.
2. Claude: better exploratory capture work and better evidence trail.

The ideal run is a synthesis: Claude's persistence and provenance, plus Codex's callback inspection, pattern discipline, and cleaner canonical assembly.
