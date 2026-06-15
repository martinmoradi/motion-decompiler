# motion-decompiler — pipeline spec (pre-skill design of record)

Status: design settled after a full end-to-end validation pass on
`mammothmurals.com` (2026-06-14/15). This document is meant to be cross-checked
by a second agent **before** the skill is written. It states the goal, the
architecture, the engine API, the exact output contract, the capture recipe per
trigger type, and the empirical findings/quirks that shaped every decision.

If you are reviewing this: the things most worth scrutinising are tagged
**[CHECK]** throughout, and collected at the end.

---

## 1. Goal

Replicate the *motion* of a landing page (first target: mammothmurals.com) in
our own stack. The tool does **not** copy code. It measures what each animation
actually does — by sampling computed style frame-by-frame in a real browser —
and emits an **agent-ready spec**. A coding agent then writes the recreation
(GSAP/CSS/whatever) from that spec.

Why measure instead of read source: the source is minified Webflow/GSAP; the
DevTools Animations panel only sees CSS/WAAPI, not GSAP's inline rAF transforms.
Sampling the rendered result captures everything regardless of how it is driven.

Non-goals: pixel-perfect asset copying, capturing canvas/WebGL shader internals
(flagged `unreadable`), or producing runnable code (that is the consuming
agent's job).

---

## 2. Architecture

One engine, one driver, two phases.

- **Engine** — `extension/capture-animation.js`. The single source of truth.
  Exposes `window.__cap`. Framework-agnostic, dependency-free, single file.
  Loaded two ways from the *same* file: the MV3 extension (for the
  Claude-in-Chrome path) and `agent-browser --init-script` (the preferred path).
- **Driver** — `agent-browser` (a Rust/Playwright CLI). It drives a real
  Chromium **by CSS selector** via CDP real input. This is the key choice: no
  screenshot coordinates anywhere.
- **Phase 1 — MAP (headless):** `./bin/capture-browser open --init-script
  <engine>`, then `__cap.map()`. Reads the GSAP/ScrollTrigger registry + CSS +
  DOM. Cheap, fast, deterministic. Produces the animation inventory + capture
  plan.
- **Phase 2 — CAPTURE (headed):** `./bin/capture-browser open --headed
  --init-script <engine>`. For each item the map says needs capture, run the timed recipe
  (§5) by selector. Headed = real compositor advances (headless does not sample
  rAF/transition motion — measured: 0 layers headless vs 6 headed).

```
                 same extension/capture-animation.js
                          │
        ┌─────────────────┴───────────────────┐
   --init-script (headless)            --init-script (headed)
   agent-browser MAP                   agent-browser CAPTURE
   __cap.map()  ── inventory ───────▶  __cap.scan/on + trigger + dump
                                            │
                                   animations.json (+ .md + timelines/)
```

**Driver decision rationale.** The earlier two-browser split (agent-browser for
map + Claude-in-Chrome MCP for capture) is retired. The MCP forces
screenshot-pixel coordinates, which the Claude extension header destabilises
(header appears/resizes the viewport → measured coords go stale → missed
triggers), and it costs one round-trip per wheel-scroll. agent-browser drives by
selector (Playwright resolves the live element box at action time), is
scriptable/batchable, and the headed window can be pinned on the second monitor
exactly like the MCP Chrome (shared Hyprland `claude-mcp` class). The MV3
extension path remains supported for environments without agent-browser (e.g.
hand-driving from DevTools), but is not the primary path.

---

## 3. Engine API (`window.__cap`)

| Method | Phase | Returns | Purpose |
|--------|-------|---------|---------|
| `libs()` | 1 | string[] | Detected animation libs (GSAP, ScrollTrigger, Lenis, Webflow, jQuery, Three, Motion, Framer, Lottie, anime). |
| `map()` | 1 | object (also `window.__capMap`) | **Static structural map** (no interaction). See below. |
| `on(sel, {trigger})` | 2 | this | Arm a recorder on ONE element (+ auto-detected stagger children). |
| `scan(sel, {trigger})` | 2 | this | Arm a diff-recorder over a whole subtree — the robust default (catches layers you can't target, pointer-events:none, behind text). |
| `boot({selectors, ms})` | 2 | this | Start a fixed-window boot recorder for load-time reveals. Can be auto-started with `window.__capAutoBoot` from an earlier init script. |
| `bootDump()` | 2 | spec object (also `window.__capBootLast`) | Finalize a boot capture. Use `bootDump({copy:false})` for automation. |
| `gsap()` | 1/2 | object | Return logged GSAP/CustomEase source evidence captured by the injected probe. |
| `dump()` | 2 | spec object (also `window.__capLast`, + clipboard) | Finalize and return the captured spec. Use `dump({copy:false})` for automation. |
| `stop()` | 2 | — | Reset/disarm. |
| `pick()` | 2 | — | Toolbar element picker (extension path only). |

`trigger` ∈ `hover` (default) | `scroll` | `load` | `manual`. `hover`/`scroll`
arm a listener/IntersectionObserver and start on the event; `manual` starts
recording immediately (used when the driver dispatches the trigger itself).

When injected early enough, the engine also wraps the page's own `gsap` and
`CustomEase` globals. Capture output includes `evidence.gsap.entries` with
source-level facts such as method, target locators, duration, ease, stagger, and
CustomEase SVG data. This does not replace computed-style sampling; it explains
sampled motion when the page exposes useful GSAP data.

**`map()` output** (validated on mammothmurals):
```jsonc
{
  "libs": ["GSAP","ScrollTrigger","Lenis","Webflow","jQuery"],
  "scrollTriggers": [            // the registry — often the FULL spec for scroll anims
    { "i":1, "trigger":"div.hero_home_hero", "start":"top bottom", "end":"bottom top",
      "scrub":true, "pin":false, "toggleActions":"play", "callbacks":["onEnter",...],
      "anims":[ { "targets":["img.hero_home_image"], "duration":0.5, "ease":"none",
                  "stagger":null, "props":{ "y":125 } } ] }
  ],
  "hoverCandidates": ["a.g_btn_main", "div.services_home_arrows", ...],  // brute-force these (§5)
  "cssHovers": [ { "sel":"span.accordion_css_item_contain", "prop":"transform",
                   "dur":"0.75s", "ease":"cubic-bezier(0.31,0.75,0.22,1)" } ],
  "loops": [ { "sel":"div.hero_home_deco", "name":"spriteFrames", "dur":"0.5s",
               "timing":"steps(4)" } ],                                  // infinite CSS
  "splitReveals": [ { "host":"h1.hero_home_heading", "section":"section.hero_home_wrap",
                      "count":6, "kinds":["lines-split-mask","lines-split"] } ],
  "sections": ["section.hero_home_wrap", ...]
}
```

**Sampled properties** (what the recorder reads each frame):
`transform, opacity, filter, clipPath, backgroundPosition, backgroundColor,
color, height, width`. `height`/`width` were added so layout-driven motion
(accordions/expanders) is no longer invisible. **[CHECK]** height/width add some
noise on scroll captures (reflow); the recipe scopes the scan root tightly for
click captures to mitigate. Consider gating layout props to non-scroll modes if
noise is a problem in the wild.

`transform` is matrix-decoded to readable parts (scaleX/Y, rotate, x/y; 3D
matrices decompose to rotateX/Y/Z + z, flagged `_approx3d` because Euler
recovery is approximate). Recorder stops `SETTLE_MS=220`ms after motion ceases,
or `MAX_MS=6000`ms hard cap; scan throttle `30`ms.

---

## 4. Output contract (the deliverable)

Written to `./<domain>.animations/`. Three artifacts; **`animations.json` is the
canonical source, everything else is derived from it.**

### 4.1 `animations.json`
```jsonc
{
  "meta": {
    "url": "https://example.com/",
    "capturedAt": "2026-06-15",        // passed in; never invented
    "viewport": [1280, 800],
    "stack": ["GSAP","ScrollTrigger","Lenis","Webflow"],
    "method": "...", "notes": "..."
  },
  "tokens": {                           // recurring values lifted to reusable names
    "ease.signature": { "bezier":"cubic-bezier(0.16,1,0.3,1)", "gsap":"expo.out" },
    "dur.base": "0.65s"
    // reference these by name from animations[].lead.ease
  },
  "patterns": [                         // group instances sharing a mechanism ->
    { "id":"scroll-parallax", "trigger":"scroll",   // recreation builds ONE utility
      "appliesTo":"hero image, work header, ... (4 ST)",
      "summary":"scrub transform y/yPercent, ease none",
      "confidence":"measured" }
  ],
  "animations": [
    { "id":"work-card-hover",           // stable kebab-case
      "label":"Work card cover reveal on hover",
      "selector":".work_home_item_link",          // how to LOCATE it (resolve live)
      "trigger":"hover",                           // hover|scroll|click|load|manual
      "mechanism":"transform",                     // transform|opacity|height|splittext|...
      "patternId":null,                            // or a pattern id
      "layers":6, "stagger":{ "items":5, "ms":125 },   // stagger null if none
      "lead": {                                    // the representative/driving layer
        "selector":"div.work_home_cover_deco",
        "from":{ "scale":1.1 }, "to":{ "scale":1 },
        "duration":"0.65s", "ease":"ease.signature",
        "easeBezier":"cubic-bezier(0.16,1,0.3,1)" },
      "confidence":"measured",
      "timelineRef":"timelines/work-card-hover.json",  // raw frames, or null
      "notes":"" }
  ],
  "unspecced": [ { "id":"...", "note":"why it isn't fully captured" } ]
}
```

`confidence` values:
- `measured` — read directly from CSS/registry/computed style. Trust it.
- `unknown — verify` — motion captured but easing unreadable (GSAP/canvas drives
  it with no CSS to inspect). Numbers right; curve is a guess.
- `_approx3d` — 3D matrix decomposed; translate/scale exact, Euler close.
- `unreadable` — canvas/WebGL/shader; not spec-capturable; `lead` may be null.

### 4.2 `animations.md`
Rendered **from** the JSON, never authored separately. Sections in order:
Signature moments (build first, ordered by site identity) → Patterns (one
reusable utility each) → Polish (table-stakes) → Needs-verify → Can't
spec-capture. Rule: if a number isn't in the manifest, it doesn't belong in the
report.

### 4.3 `timelines/<id>.json`
Raw `dump()` output (per-frame samples) for animations where the frame curve
matters, referenced by `lead`/`timelineRef`. Page to disk: call
`__cap.dump({copy:false})`, which returns the object and sets
`window.__capLast`, then save with
`./bin/capture-browser eval 'JSON.stringify(window.__capLast)' --max-output 1000000`.
For boot captures, use `__cap.bootDump({copy:false})` and
`window.__capBootLast`. Do not rely on clipboard timing or permissions.

A worked example produced by the v1 pass lives at
`~/mammothmurals.com.animations/` (note: produced before the engine fixes — a
few entries are improvable now, e.g. the accordion and the hero reveal).

---

## 5. Capture recipe (per trigger type)

General shape: **position → arm → trigger → wait → dump**, all by selector.

- **hover (CSS or GSAP):**
  `scrollintoview <sel>` → `eval __cap.scan(<sel>,{trigger:'hover'})` (or
  `manual`) → `./bin/capture-browser hover <sel>` → wait the duration →
  `eval __cap.dump({copy:false})`.
  Use `scan` not `on`: the hovered element often doesn't move; its children do
  (`on` caught 0 on the work card, `scan` caught 6).
- **magnetic / cursor-tracking hover:** as above but after `hover`, dispatch a
  few `./bin/capture-browser mouse move <x> <y>` across the element's box (these effects
  follow the real cursor; a single hover gives a partial result). **[CHECK]**
  not yet re-validated end-to-end with the agent-browser driver.
- **click (e.g. accordion):** `scrollintoview` → `scan(<tight root>,{manual})`
  → `./bin/capture-browser click <sel>` → wait →
  `__cap.dump({copy:false})`. Scope the scan root to the item,
  not the section, to limit height-reflow noise.
- **scroll reveal (onEnter):** arm `scan(<sel>,{trigger:'scroll'})` while the
  element is BELOW the fold → `scrollintoview <sel>` → wait →
  `__cap.dump({copy:false})`. The engine's
  IntersectionObserver starts recording as it enters. Captured the cta reveal
  cleanly (8 layers) where coordinate-MCP got 0.
- **load reveal:** the engine is injected via `--init-script` BEFORE page JS, so
  it can auto-arm for load animations. **[CHECK]** auto-arm-on-load mode is
  designed but not yet implemented/validated; today the hero line reveal is
  flagged from `map().splitReveals` and timing inferred from the signature
  token. This is the one trigger class without a proven capture.

`--init-script` registers file content at `open` time: to pick up an edited
engine, `close` then `open` (a `reload` re-runs the old content). On Martin's
trusted local machine, use `./bin/capture-browser` for all capture commands.
It defaults `AGENT_BROWSER_SESSION=decompile`, keeps the headed Chromium window
in the Hyprland floating/pinned rule by injecting
`--args "--class=claude-mcp"` only on `open`, and passes
`--confirm-actions "" --confirm-interactive false` on every call. Do not set
`AGENT_BROWSER_ARGS` globally for the wrapper; follow-up commands can otherwise
attach to a fresh headless session. Pass complex JS to `eval` as an IIFE via a
temp file.

---

## 6. What we found out (empirical, from the full pass)

1. **The GSAP registry is most of the map.** On mammothmurals, `map()` specced
   7/11 animations with zero capture: scrub-parallaxes' from/to/ease are
   literally in the tween `vars`; sprite loops and CSS transitions come from CSS.
2. **Only callback/event motion needs capture.** ScrollTrigger `onEnter`
   callbacks (imperative reveals) and event-bound GSAP hovers are invisible to
   the registry. The map flags them; capture measures them.
3. **Synthetic event dispatch does NOT work** for this class of site. Hovers are
   driven by a global real-pointer tracker (GSAP `quickTo` on window mousemove),
   not per-element listeners; `el.dispatchEvent(...)` never updates the pointer
   state it reads (0 captured, in-view, even with mousemove dispatch). Real CDP
   pointer (agent-browser `hover`) is required.
4. **`el.scrollIntoView()` is fought by Lenis** (lands then drifts). Use
   agent-browser `scrollintoview <sel>` (Playwright resolves the live box at
   action time and self-corrects).
5. **Coordinates are the enemy.** Every missed capture in the MCP path traced to
   stale screenshot coordinates (header resize, page drift) or scroll
   round-trip cost. Selector-driving removes the whole class of failure.
6. **Two signature eases**, not one: `cubic-bezier(0.16,1,0.3,1)` (expo.out) @
   0.65s for reveals + card hover; `cubic-bezier(0.31,0.75,0.22,1)` @ 0.45s for
   interactive hovers (button, arrows) + the accordion.
7. **The original map missed things capture caught:** the hero headline
   SplitText line reveal (now surfaced by `map().splitReveals`), and it
   mislabeled `work_home_cover` as splittext when it's an image crossfade
   (mechanism guesses for onEnter callbacks are unreliable → treat as
   needs-capture).
8. **Engine gap (now fixed):** sampled only transform/opacity/filter/clip/bg/
   color, so the height-based accordion captured 0. Added height/width sampling;
   accordion now captures the panel expansion.
9. **Fixes validated this session:** `__cap.map()` (8 ST, 74 hover candidates,
   split/load reveal hosts incl. hero); height capture on the accordion;
   `agent-browser --headed hover-by-selector` reproduces work-card (6 layers),
   the previously-missed CTA arrow hover (3 layers), and the cta scroll reveal
   (8 layers).

---

## 7. Environment

Headed capture window:

```bash
./bin/capture-browser close --all
./bin/capture-browser open <url> --headed --init-script <engine>
./bin/capture-browser set viewport W H
```

The wrapper sets the `claude-mcp` Hyprland class, which floats + pins it at
1280x1080 on the vertical second monitor (HDMI-A-1, ws6), shared with the
Claude-in-Chrome Chrome. DPR 1.

---

## 8. Local CLI skeleton

`bin/motion-decompile` is the first repeatable local pipeline skeleton. It wraps
`bin/capture-browser`, keeps the engine injected from
`extension/capture-animation.js`, writes inspectable run artifacts, and
assembles the section 4 spec contract from `map.json` plus saved timelines.

Commands:

```bash
./bin/motion-decompile init https://mammothmurals.com/
./bin/motion-decompile map runs/mammothmurals.com/2026-06-15-run
./bin/motion-decompile plan runs/mammothmurals.com/2026-06-15-run
./bin/motion-decompile capture runs/mammothmurals.com/2026-06-15-run manifest.json
./bin/motion-decompile assemble runs/mammothmurals.com/2026-06-15-run
./bin/motion-decompile report runs/mammothmurals.com/2026-06-15-run
```

Single-command run:

```bash
./bin/motion-decompile run manifest.json
```

Current artifact layout:

```text
runs/<domain>/<date>-<slug>/
  map.json
  manifest.json
  manifest.proposed.json
  capture-plan.json
  capture-plan.md
  capture-results.json
  animations.json
  animations.md
  timelines/<capture-id>.json
  report.md
  run-log.md
```

Current manifest shape:

```json
{
  "url": "https://mammothmurals.com/",
  "viewport": [1280, 800],
  "captures": [
    {
      "id": "faq-accordion",
      "type": "click",
      "root": "div.g_faq_item.w-dyn-item",
      "action": "click div.g_faq_item.w-dyn-item",
      "waitMs": 900
    }
  ]
}
```

Supported capture types in v1: `hover`, `click`, `scroll` /
`scroll-reveal`, and `boot` / `load`. Click and hover captures scroll the target
into view, arm immediately before the real wrapper action, wait, then finalize
with `dump({ copy:false })`. Boot captures create a temporary pre-engine init
script that sets `window.__capAutoBoot`, open a fresh page, wait, and finalize
with `bootDump({ copy:false })`.

`plan` reads `map.json` and writes `manifest.proposed.json`,
`capture-plan.json`, and `capture-plan.md`. It dedupes by capture signature and
by hover mechanism. Current proposal classes:

- boot capture for mapped split reveal hosts;
- `scroll-reveal` captures for callback-only ScrollTriggers with a selector;
- one tight accordion click when FAQ/accordion selectors are present;
- one representative CSS hover per transition timing group;
- a capped set of representative hover candidates such as work card, wordmark,
  primary button, arrow row, nav link, and generic link.

The plan output is a proposal, not an instruction to blindly capture everything.
Review selectors in `capture-plan.md`, edit `manifest.proposed.json` if needed,
then pass that manifest to `capture`.

`assemble` creates `animations.json` and `animations.md`. It promotes
registry-backed ScrollTrigger tweens, CSS loops, CSS hover timings, and split
reveal hosts from `map.json`, then adds one animation entry for each saved
timeline. It chooses a representative lead layer from each timeline, preferring
height motion for click captures so accordions do not get summarized by their
label text.

The assembler is deliberately conservative. Registry-backed tweens and CSS
loops are `measured`; callback-only ScrollTriggers, CSS hover timing entries
without live deltas, split reveal hosts, and timeline captures with unreadable
easing are `unknown - verify`. Manifest entries may override label, mechanism,
patternId, notes, confidence, and tokens when a run has hand-authored context.

---

## 9. Open questions for the cross-checking agent  [CHECK]

1. **`map()` in the engine vs the skill.** It is currently in the engine (single
   source of truth, both phases inject it). Is that the right home, or should
   structural mapping live in the skill so the engine stays purely "capture"?
2. **height/width noise.** Acceptable globally, or gate layout props to
   click/non-scroll captures?
3. **Load reveals.** Approve the auto-arm-on-load approach (engine arms itself
   when injected pre-page-JS), or prefer network-throttle-to-slow-load?
4. **Magnetic hovers.** Confirm the `mouse move` sample sequence is the right
   recipe; it is designed but not yet validated against the driver.
5. **`unspecced` vs `animations`.** Is a separate `unspecced[]` array the right
   place for non-discrete drivers (scroll-progress nav, lightbox UI), or should
   they be `animations[]` with `confidence:"unreadable"`?
6. **Tokens granularity.** Two eases + one base duration captured as tokens — is
   that the right altitude, or should every recurring duration/stagger be a
   token?
7. **Skill scope.** The skill should orchestrate map → plan → capture → assemble
   and own the output contract. Anything in this spec that should NOT be the
   skill's responsibility?
