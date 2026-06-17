# Assessment

This is not the ceiling. The current script and flow are already good enough to produce a useful agent-ready spec for many marketing sites, especially when animations are either visible in GSAP/ScrollTrigger registries or expressed as CSS transitions/keyframes. But the run exposed several reliability limits that are improvable with targeted changes.

## What worked well

- The phase split is sound: static map first, targeted captures second, offline assembly last.
- The `__cap.map()` sweep gives excellent coverage of ScrollTrigger scrub tweens, CSS loops, CSS transition timings, split text hosts, and hover candidates.
- Scoped `scan()` is the right default for hovers because the element being hovered often does not move, but descendants do.
- The raw timeline files are valuable. Even when final confidence is low, they let another agent inspect the actual sampled values.
- The prompt's requirement to log skipped candidates is important. It prevents fake completeness when a site has dozens of duplicated hover descendants.

## Script improvements

### 1. Capture all changed properties per element

Current `analyze()` returns the first changed property in priority order. If an element changes transform, opacity, and filter together, only transform is reported. This caused loss around CTA reveals and accordion child states.

Improve by emitting a `properties` object per finding:

- `transform.from/to/timeline`
- `opacity.from/to/timeline`
- `filter.from/to/timeline`
- `clipPath.from/to/timeline`
- `height/width.from/to/timeline`

Then pick a lead property for summaries, but keep the full per-element diff in raw output.

### 2. Fix stagger detection so it does not misclassify unrelated layers

The current stagger detector only considers transform findings, but the summary can imply a stagger across mixed or root-height changes. It also collapses sibling details into a note, which is compact but lossy.

Improve by grouping only when:

- selectors are the same or share a known repeated parent,
- changed property sets match,
- from/to values are similar within tolerance,
- peak times are ordered and non-random.

Keep all findings in raw output even when a stagger summary is generated.

### 3. Add a navigation-start load recorder

Load reveals are the biggest blind spot. The init script could support a pre-armed recorder mode that starts at `DOMContentLoaded` or even immediately on script injection, watches specified likely hosts, and buffers the first 2 to 4 seconds.

Useful API:

```js
__cap.boot({ selectors: ['h1', '[class*=split]', '[class*=hero]'], ms: 4000 })
__cap.bootDump()
```

This would turn hero split-line reveals from `unknown - verify` into measured timelines.

### 4. Monkeypatch GSAP calls during capture

For callback-driven animations, ScrollTrigger often exposes only `()=>_.play()` or a minified callback. A temporary monkeypatch could log `gsap.to`, `gsap.from`, `gsap.fromTo`, `timeline.to`, `timeline.from`, and `timeline.fromTo` calls during the capture window.

This would capture:

- target selectors,
- vars before minified closure values disappear,
- duration,
- ease names,
- stagger values,
- autoAlpha/filter/clipPath values that computed-style sampling may miss.

This is probably the highest-leverage improvement after multi-property findings.

### 5. Record initial state before smooth scrolling changes it

Lenis and smooth scrolling can start changing scroll-driven transforms before the recorder sees the intended trigger state. The CTA reveal showed this clearly.

Options:

- temporarily stop or disable Lenis during setup,
- use instant `window.scrollTo()` for positioning before arming,
- record continuously from manual arm and mark the first trigger timestamp separately,
- add `__cap.before(sel)` to save a computed-style baseline while the element is below the fold.

### 6. Improve CSS hover analysis

The CSS sweep currently reads transition property, duration, and ease, but not from/to hover values unless the animation is live-captured.

Possible angles:

- Use Chrome DevTools Protocol to force `:hover` pseudo-class and read computed styles.
- If CDP forcing is not available through `agent-browser`, add a small helper in the CLI or use a standalone CDP call.
- Parse stylesheet rules for `:hover` selectors as a fallback, though CSS variables and cascade make this less reliable than forced pseudo state.

### 7. Better selectors in timeline output

`cssPath()` often returns generic selectors like `div.g_cta_image` or `img.work_home_image.u-ratio-3-2`, which is ambiguous when there are many instances.

Improve selector generation with:

- nearest stable ancestor,
- `:nth-of-type()` or `:nth-child()` when needed,
- text snippets for links/buttons,
- generated path plus a human label.

### 8. Export raw frames, not just downsampled timelines

The engine downsamples to 12 frames inside findings. That is friendly for reports but weak for easing estimation. Keep both:

- compact `timeline` for spec readers,
- `rawFrames` or a separate raw capture file for analysis.

### 9. Add easing estimation

When CSS or GSAP easing is unreadable, infer an approximate cubic-bezier from sampled progress. Confidence should remain `unknown - verify`, but an estimated curve would help recreation agents.

The fitting should be opt-in and labeled clearly, for example:

```json
"estimatedEase": {
  "bezier": "cubic-bezier(...)",
  "source": "fit from 21 transform samples",
  "confidence": "estimated"
}
```

### 10. Capture reverse states

Many interactions have meaningful leave/close motion. The flow mostly captures enter/open. Add recipes and API support for:

- hover in and hover out,
- accordion open and close,
- scroll enter and leave/back.

## Prompt improvements

The prompt is strong. The main improvements would reduce ambiguity and wasted retries.

### 1. Require an explicit capture plan artifact

Add `OUTPUT_DIR/capture-plan.json` with:

- all found candidates,
- selected candidates,
- skipped candidates,
- reason,
- planned trigger,
- final status.

This makes the "why this was skipped" logic machine-readable.

### 2. Ask for callback inspection explicitly

The prompt says registry-bound scroll animations need no capture, but callback-based animations need capture. It should also say to inspect callback function strings and live GSAP CustomEase paths when available.

That gave useful facts in this run:

- `ease-primary` SVG path,
- `ease-secondary` SVG path,
- CTA reveal `autoAlpha`, `filter`, and `stagger:{from:"center"}`,
- navbar `xPercent/yPercent` callback behavior.

### 3. Define confidence rules for hybrid evidence

Some animations are half measured and half inferred from callback strings. The prompt could define a middle confidence like `measured-partial` or require a `confidenceReasons[]` array.

Current confidence labels are workable, but they flatten useful nuance.

### 4. Include mobile viewport as optional second pass

At `1280x800`, mobile menu motion is hidden. If the goal is "every animation on the page", the prompt should specify whether desktop-only is acceptable or require a mobile pass such as `390x844`.

### 5. Require report generation script or provenance

The prompt says render Markdown from JSON, which is good. It could require saving the render script or adding a provenance block so another agent can regenerate the Markdown exactly.

## Is this the ceiling?

No. The current flow is a strong baseline, but it is not the ceiling.

The practical ceiling for this exact script is reached when animations are:

- load-only and finished before arming,
- driven by minified JS callbacks with closure variables,
- multi-property on one element,
- hidden behind pseudo-class states,
- canvas/WebGL/video-only,
- affected by smooth scrolling while sampling.

Those are common, and this run hit several of them. But most are not fundamental browser limitations. They are instrumentation gaps.

## Best next experiments

1. Add multi-property findings and preserve all raw tracks.
2. Add a GSAP monkeypatch logger during capture.
3. Add boot-time load capture from the init script.
4. Add CDP forced pseudo-state support for CSS hovers.
5. Add a mobile pass option to the prompt and output schema.
6. Add `capture-plan.json` as a required artifact.

If I had to choose only one script change, I would implement multi-property findings. If I had to choose one bigger instrumentation change, I would monkeypatch GSAP calls during capture. If I had to choose one prompt change, I would require a capture-plan artifact.

