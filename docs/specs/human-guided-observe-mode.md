# Human-Guided Observe Mode

> **Where this fits:** Observe Mode is the **human-guided capture mode** of the
> `yoink` pipeline — see [docs/ARCHITECTURE.md](../ARCHITECTURE.md). It is not a
> separate product. It is the capture mode for the hard stuff automation misses
> (Choreography, invisible hover zones, "the good bit"), and it drives the
> human-gated *capture loop* that accretes into the Report. These remain loose
> notes on its mechanics (toolbar, marks, focus area, scroll corridors); the
> product framing is now settled in ARCHITECTURE.md and CONTEXT.md.

Loose notes from June 16, 2026. This is not a formal spec yet. It is a place to
keep the shape of the idea before it drifts.

## Short Version

YoinkIt should not only automate animation discovery. It should also let a human
drive a real browser and leave intent signals while YoinkIt measures what
actually happens.

The current automated path is still valuable: map the page, plan likely
captures, drive known hovers/clicks/scrolls, and produce repeatable artifacts.
But there is another mode that may be more powerful for expressive sites:

1. Open a real headed browser with the capture engine injected.
2. Let the human scroll, hover, click, and explore naturally.
3. Let the human mark moments or areas that feel important.
4. YoinkIt records the event context, computed-style motion, screenshots, and
   notes.
5. The agent later turns those observations into recipes, specs, and docs.

The product feeling is closer to a field recorder than a brute-force crawler.

## Why This Might Matter

Animation discovery is hard because the agent often does not know what is
worth triggering:

- Hover zones can be invisible until a person finds them.
- Scroll animations can depend on velocity, smooth-scroll libraries, viewport
  position, or pinned timelines.
- GSAP and Webflow interactions can hide behind handlers that are not obvious
  from static DOM inspection.
- Some motion is real but not important. Some tiny polish is worth ignoring.
- Some motion is important because it feels like the signature of the site, and
  that judgment is human.

The human can provide intent. YoinkIt can provide measurement. That pairing is
the interesting bit.

## Browser Surface

For this mode, `agent-browser` is still the better fit than the Codex in-app
browser:

- It can open a real headed Chrome.
- It supports `--init-script extension/capture-animation.js`.
- It can run page evals and retrieve `window.__cap*` state.
- It has real hover, scroll, click, screenshot, video, and a WebSocket visual
  stream.

The Codex in-app browser is safer and pleasant for ordinary inspection, but its
Playwright `evaluate(...)` is documented as read-only and it does not currently
look like the right instrumentation harness.

## Core API Sketch

Possible shape:

```js
__cap.listen({
  mode: "observe",
  ringBufferMs: 1500,
  burstMs: 2200,
  sampleVisible: true
});

__cap.mark("something is happening here");
__cap.focusArea();
__cap.scrollMark("start", "CTA wheel reveal begins");
__cap.scrollMark("end", "CTA wheel reveal settled");
__cap.sessionDump({ copy: false });
```

The actual UI could be a floating toolbar, hotkeys, or both.

## The Important Human Signals

### Mark This Moment

A button or hotkey for "something is happening here."

When pressed, YoinkIt should keep a window around the moment:

- last N milliseconds of sampled movement,
- next N milliseconds of movement,
- current scroll position and velocity,
- current hover/click/focus target,
- visible moving layers,
- viewport screenshot,
- optional cropped screenshot if an area is active.

This helps with unknown triggers. The engine may not know whether the motion was
caused by wheel, pointermove, custom JS, ScrollTrigger, or a delayed timeline.
The human can still say: this moment matters.

### Focus Area

A rectangle or click-to-select area that tells YoinkIt to go deeper here.

Inside the area, the recorder can:

- sample more elements,
- include pseudo-elements more aggressively,
- ignore unrelated page-wide loops,
- capture before/mid/after crops,
- create a tighter selector inventory,
- let the agent run deeper targeted probes later.

This is likely more useful than global capture on complex pages. It turns "find
every animation" into "study this motion cluster."

### Scroll Corridor

Scroll needs its own mental model. A time-only capture is often not enough for
scrubbed or pinned motion.

A scroll corridor is a marked range of page exploration:

- start scrollY,
- end scrollY,
- viewport size,
- scroll velocity profile,
- moving elements,
- changed properties,
- ScrollTrigger progress when available,
- human note.

Output should be able to say:

```json
{
  "trigger": "scroll",
  "range": { "scrollY": [1840, 2310] },
  "progressLinked": true,
  "motion": "opacity 0 -> 1, y 80 -> 0"
}
```

Human controls could be simple: "start scroll capture", "mark here", "end scroll
capture." A note can explain what the person saw.

### Notes

Let the human attach a note to a mark or area:

- "watch the cards, not the background"
- "signature transition"
- "this is pinned"
- "logo stretches here"
- "not sure what triggers this, but this is the good bit"

The note should be explicit and intentional. Do not record typed page input. The
note belongs to YoinkIt, not to the target page.

### Importance

A tiny classification could help later:

- signature,
- useful,
- polish,
- ignore,
- unsure.

This is not required for capture, but it helps the generated spec and the agent
prioritize follow-up work.

## What The Recorder Should Store

The session dump should probably contain:

- page URL, viewport, user agent, timestamp,
- detected libraries,
- event timeline with safe event categories,
- pointer target selectors and element rects,
- scrollY and velocity samples,
- human marks and notes,
- focus area rectangles,
- capture bursts,
- changed computed properties,
- GSAP evidence where available,
- screenshots and crops as artifact paths,
- confidence and attribution notes.

Safe event categories means recording "click", "hover", "wheel", "key category"
or "input focused", not secret values or arbitrary user text.

## Output Shape

Possible artifact set:

```text
observe-session.json
observe-report.md
screenshots/
  mark-001-view.png
  mark-001-crop.png
  mark-001-before.png
  mark-001-after.png
timelines/
  mark-001-work-card-hover.json
  scroll-corridor-001-cta-wheel.json
```

The Markdown report could be useful both for the agent and for human
documentation:

```md
### Mark 001: Work card hover

Human note: "tile settle animation"
Trigger guess: hover
Confidence: high
Measured: 6 layers, scale 1.1 -> 1.0, stagger about 120ms

![crop](screenshots/mark-001-crop.png)
```

This could become a very nice intermediate artifact. The agent sees the measured
spec and the visual context at the same time.

## Agent Follow-Up

Observe Mode does not need to solve everything live. It can leave breadcrumbs
that the agent uses afterward.

After a human marks an area, the agent can:

- inspect selectors inside that region,
- run targeted hover captures,
- replay scroll around the marked range,
- inspect ScrollTrigger timelines,
- compare before/after screenshots,
- produce a cleaner repeatable recipe.

This suggests a three-step product loop:

1. Map: what might exist.
2. Observe: what the human noticed.
3. Replay: turn observations into repeatable captures.

## Hard Parts

### Segmentation

The recorder must decide which moving layers belong to which event or mark.
Human marks make this much easier, but grouping will still be fuzzy.

Useful signals:

- temporal distance from the mark,
- spatial overlap with focus area,
- target ancestor relationship,
- shared timing/easing,
- same ScrollTrigger instance,
- same GSAP timeline,
- same CSS transition declaration.

### Noise

Sites often have constant loops, videos, sprites, cursor effects, scroll
inertia, and lazy loading. Observe Mode needs a noise model:

- known infinite loops can be labeled as background,
- movement outside the focus area can be downranked,
- repeated motion across the whole session can be treated as ambient,
- human "ignore" marks should train the session report.

### First Frame Loss

Hover transitions can start before the recorder notices the target. The recorder
needs a rolling baseline for visible and interactable elements, especially
inside the focus area. The mark ring buffer also helps.

### Scroll Scrub

Scroll-linked motion should be represented by scroll progress, not only elapsed
milliseconds. For ScrollTrigger, use the registry when present. For unknown
scroll code, store scrollY and viewport-relative element rects with each frame.

### Privacy

Observe Mode should be careful by default:

- do not record typed values,
- do not dump form fields,
- make notes explicit,
- make screenshots optional or visible in the output,
- treat auth/session artifacts as local and sensitive.

## Nice Later Ideas

- A small HUD that says "recording", "3 moving layers", "mark saved", and
  "focus area active."
- A timeline scrubber for the session.
- A "go deeper here" command that hands an area/mark to the agent.
- A way to tag marks as hover, click, scroll, load, or unknown.
- A sidecar video for the whole session, separate from the structured spec.
- Auto-cropped contact sheets for every marked moment.
- A diff between automated discovery and human-observed discovery.

## MVP Shape

If this gets built, start small:

1. Add `__cap.listen()` with a session ring buffer and safe event log.
2. Add `__cap.mark(note)` for the important-moment button or hotkey.
3. Add a focus-area overlay.
4. Add scroll start/end marks.
5. Add `__cap.sessionDump({ copy: false })`.
6. Emit JSON plus a lightweight Markdown report.

The core test: can a human explore a page for two minutes and leave YoinkIt with
enough structured evidence for the agent to produce better animation specs than
automation alone?
