# Task: yoink a landing page's animations into an agent-ready spec

You are an autonomous agent with shell access on a Linux machine. Your job is to
**measure what every animation on a web page actually does** and emit a
structured spec another agent could use to recreate the motion. You do **not**
write recreation code; you produce the spec.

This is a **blind run**: do not read any prior analysis. Specifically, do NOT
open `docs/SPEC.md`, any `*.animations/` folder, or any `*-baseline*` folder if
you encounter them. Work only from this prompt and the live page.

---

## Target and output

- **TARGET PAGE:** `https://mammothmurals.com/`
- **OUTPUT_DIR:**: the folder you will create. Rename it with claude/codex depending on the agent that runs it, put all the following inside.
  - `OUTPUT_DIR/animations.json` — the canonical spec (see schema below)
  - `OUTPUT_DIR/animations.md` — a human report rendered FROM the json
  - `OUTPUT_DIR/timelines/<id>.json` — raw per-frame captures you reference
  - `OUTPUT_DIR/map.json` — the raw structural map from phase 1
  - `OUTPUT_DIR/RUN-LOG.md` — your process log (see "Process log" below)

---

## The tool: agent-browser (one headed session)

`agent-browser` is a CLI that drives a real Chromium **by CSS selector** over
CDP. Run `agent-browser --help` and `agent-browser skills get core --full` if you
need detail. Use **one headed session** for the whole job — headed is required
because a headless compositor does not advance/sample real animation motion.

Drive **by selector only**. Never use screenshot coordinates.

### The capture engine

A single JS file exposes `window.__cap` when injected into the page. Inject it
with `--init-script`. Engine path (absolute):
`/home/martin/src/perso/yoinkit/extension/capture-animation.js`
(reading the engine source for its API is fine; it is method, not answers.)

Launch with the repo wrapper. It keeps the `yoink` session, disables
agent-browser confirmations on every call, and sets the `claude-mcp` Chromium
class so Hyprland parks the window on Martin's second monitor. Keep this wrapper.

```bash
ENGINE=/home/martin/src/perso/yoinkit/extension/capture-animation.js
AB=/home/martin/src/perso/yoinkit/bin/capture-browser
"$AB" close --all
"$AB" open https://mammothmurals.com/ --headed --init-script "$ENGINE"
"$AB" set viewport 1280 800
```

### `window.__cap` API

- `__cap.libs()` → string[] of detected animation libraries.
- `__cap.map()` → **static structural map** (phase 1). Returns + sets
  `window.__capMap`: `{ libs, scrollTriggers[], hoverCandidates[], cssHovers[],
loops[], splitReveals[], sections[] }`. `scrollTriggers[]` includes each
  trigger's element, start/end, scrub, toggleActions, callbacks, and (when the
  animation is a bound tween) its targets + duration + ease + props — i.e. for
  scrub/registry-bound scroll animations this IS the spec, no capture needed.
- `__cap.scan(sel, {trigger})` → arm a diff-recorder over a subtree (the robust
  default: catches child layers you can't target directly).
- `__cap.on(sel, {trigger})` → arm on ONE element (+ auto stagger children).
- `__cap.dump()` → finalize; returns the spec object, also sets
  `window.__capLast`, also copies pretty JSON to the clipboard.
- `__cap.dump({copy:false})` / `__cap.bootDump({copy:false})` → same output,
  but no clipboard write. Use these in automation to avoid browser permission
  prompts.
- `trigger` ∈ `hover` | `scroll` | `load` | `manual`. `hover`/`scroll` start on
  the event; `manual` starts recording immediately (use when you trigger it
  yourself, e.g. a click).
- The recorder samples transform, opacity, filter, clipPath, backgroundPosition,
  backgroundColor, color, height, width. It stops 220ms after motion settles
  (6s hard cap). Prefer `scan` over `on` for hovers (the hovered element often
  doesn't move; its descendants do).

### agent-browser gotchas (learned the hard way)

- Pass complex JS to `"$AB" eval` as a single IIFE; write it to a temp
  file and `eval "$(cat file.js)"` to dodge shell quoting.
- `eval` output is double-wrapped (agent-browser quotes the returned string).
  To save a result: `"$AB" eval 'JSON.stringify(window.__capLast)'
--max-output 200000 > raw.txt` then in python `json.loads(json.loads(raw))`.
  Do not use clipboard reads in this calibration pass.
- A `reload` re-runs the OLD `--init-script`; to reload an edited engine you
  must `close` then `open`. (You won't edit the engine here.)
- If a session desyncs (open navigates one tab, eval hits another), `close --all`
  and reopen with a fresh session name.

---

## Workflow (one session, three phases)

### Phase 1 — MAP (read-only, ~instant)

Run `__cap.map()`, save it to `OUTPUT_DIR/map.json`. From it, build a **capture
plan**: the list of distinct animations with `{id, selector, trigger, why}`.

Classify each into one of:

- **Spec'd from registry/CSS — no capture needed:** scrub/bound ScrollTrigger
  tweens (read from/to/ease/props directly), CSS `loops` (infinite sprite/marquee
  animations), and `cssHovers` (read prop/dur/ease from the entry). Mark these
  `measured`.
- **Needs live capture:** ScrollTrigger `onEnter`/callback reveals (motion is in
  a callback, not the registry), event-bound hovers (every `hoverCandidate` that
  isn't a `cssHover`), `splitReveals` (SplitText/mask line reveals), the
  accordion, etc.

Don't try to capture all ~70 hover candidates. Prioritize: every distinct scroll
reveal, the signature/repeated hover interactions (cards, primary buttons,
nav/CTA arrows — dedupe ones that clearly share a mechanism), and any accordion.
Log what you chose to skip and why.

### Phase 2 — CAPTURE (by selector, sequential)

For each plan item that needs capture, use the matching recipe. General shape:
**position → arm → trigger → wait the duration → dump → save timeline.**

- **hover (CSS or GSAP):** `"$AB" scrollintoview <sel>`; eval
  `__cap.scan('<sel>',{trigger:'hover'})`; `"$AB" hover <sel>`; wait
  ~1.5s; eval `__cap.dump({copy:false})`; save `window.__capLast`.
- **magnetic / cursor-tracking hover:** as above, but after `hover`, also do a
  few `"$AB" mouse move <x> <y>` across the element's box (these effects
  follow the real cursor; one hover gives a partial result). Get the box with
  `"$AB" get box <sel>`.
- **click (e.g. accordion):** `"$AB" scrollintoview <sel>`; arm
  `__cap.scan('<tight root>',{trigger:'manual'})`; `"$AB" click <sel>`;
  wait; eval `__cap.dump({copy:false})`. Scope the scan root to the item (not the
  whole section) to limit layout-reflow noise.
- **scroll reveal (onEnter):** arm `__cap.scan('<sel>',{trigger:'scroll'})`
  while the element is still BELOW the fold; then `"$AB" scrollintoview <sel>`;
  wait; eval `__cap.dump({copy:false})`. (The engine starts recording as it
  enters.) These fire once and usually don't replay on re-enter — if you miss
  one, reload and retry.
- **load reveal (hero headline etc.):** these fire during page load before you
  can arm, so they're hard to capture after the fact. Record them structurally
  from `map().splitReveals` with `confidence: "unknown — verify"`, note the
  mechanism (e.g. line-mask reveal), and move on. Note this limitation in the log.

Save each capture's full `window.__capLast` to `OUTPUT_DIR/timelines/<id>.json`.

### Phase 3 — ASSEMBLE (offline)

Write `animations.json` (schema below) from the map + captures, then render
`animations.md` from it. Close the browser when done (`"$AB" close --all`).

---

## Output contract

### `animations.json`

```jsonc
{
  "meta": {
    "url": "...",
    "capturedAt": "<today's date, do not invent>",
    "viewport": [1280, 800],
    "stack": ["GSAP", "..."],
    "method": "...",
    "notes": "...",
  },
  "tokens": {
    // recurring values lifted to reusable names; reference
    "ease.signature": { "bezier": "cubic-bezier(...)", "gsap": "..." },
    "dur.base": "...", // by name from animations[].lead.ease
  },
  "patterns": [
    // group instances sharing ONE mechanism
    {
      "id": "...",
      "trigger": "scroll",
      "appliesTo": "... (xN)",
      "summary": "...",
      "confidence": "measured",
    },
  ],
  "animations": [
    {
      "id": "kebab-case-id",
      "label": "human label",
      "selector": "how to LOCATE it",
      "trigger": "hover|scroll|click|load|manual",
      "mechanism": "transform|opacity|height|splittext|backgroundPosition|...",
      "patternId": null,
      "layers": 6,
      "stagger": { "items": 5, "ms": 125 },
      "lead": {
        "selector": "driving layer",
        "from": {},
        "to": {},
        "duration": "...",
        "ease": "ease.signature",
        "easeBezier": "cubic-bezier(...)",
      },
      "confidence": "measured",
      "timelineRef": "timelines/<id>.json",
      "notes": "",
    },
  ],
  "unspecced": [{ "id": "...", "note": "why not fully captured" }],
}
```

`confidence`: `measured` (read from CSS/registry/computed style — trust it) ·
`unknown — verify` (motion captured but easing unreadable, GSAP/canvas-driven) ·
`_approx3d` (3D matrix decomposed; translate/scale exact, rotation approximate) ·
`unreadable` (canvas/WebGL — not spec-capturable, `lead` may be null).

### `animations.md`

Render FROM the json (do not author separately). Sections in order: **Signature
moments** (build first, ordered by site identity) → **Patterns** (one reusable
utility each) → **Polish** (table-stakes) → **Needs verify** → **Can't
spec-capture**. Rule: if a number isn't in the json, it doesn't belong here.

---

## Process log (`RUN-LOG.md`) — required

As you go, record: start/finish timestamps and rough time per phase; the exact
commands/approach that worked; every hiccup or failure and how you resolved it
(or didn't); decisions and why (what you captured vs skipped); anything
surprising about the page or the tooling; and a final **self-assessment**:
coverage (how many animations found vs captured), confidence breakdown, and what
you'd do with more time. Be candid about misses — this log is as valuable as the
spec.

---

## Constraints

- Drive by selector, never coordinates. One headed agent-browser session.
- Do not start long-running dev servers. Use one-shot CLI calls.
- If a browser action fails 2-3 times, stop retrying that approach, log it, and
  move on — do not loop.
- Be honest about confidence; never invent easing/duration numbers you didn't
  measure or read.
- When done, print a 5-line summary to stdout: counts (found / measured /
  needs-verify), where the output is, and the top 1-2 issues you hit.

```
Deliverables checklist: animations.json · animations.md · timelines/*.json ·
map.json · RUN-LOG.md — all under OUTPUT_DIR.
```
