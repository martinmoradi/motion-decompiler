# YoinkIt

For educationally yoinking the good stuff.

**A web-animation yoinker.** It reads what an animation *actually does* by
sampling computed style every frame — regardless of how it is driven: CSS
transitions/keyframes, GSAP inline transforms on `requestAnimationFrame`, or CSS
sprite `steps()`. The built-in DevTools **Animations** panel only sees CSS/WAAPI
animations, so it shows nothing for GSAP- or canvas-driven motion; this sees
everything because it reads the rendered result.

The output is **yoinked motion, not code**: detected libraries, a one-line plain-English
`summary` of the whole animation, and a `findings` array - each animating layer
with its measured timing/easing and a frame-by-frame timeline. Capturing is the
tool's job; **writing the recreation is the LLM's job** - hand the spec to a
coding agent (paste it, or use it from the console) and it builds a faithful
version in your stack. `dump()` returns the spec and copies the pure JSON to the
clipboard; automation can use `dump({ copy:false })`.

It's designed to feed AI coding agents a two-part workflow: **map** a page
cheaply (structure, stack, selectors), then **capture** the motion of the pieces
that matter and recreate them. The capture must run in a real, rendered browser
(headless synthetic events don't fire most hover/scroll handlers).

For trusted local `agent-browser` runs on Martin's machine, use the wrapper so
every command keeps the same session, no-confirm flags, and Hyprland window
class:

```bash
./bin/capture-browser open https://example.com/ --headed --init-script extension/capture-animation.js
./bin/capture-browser set viewport 1280 800
```

`bin/capture-browser` defaults `AGENT_BROWSER_SESSION=yoink`, injects
`--args "--class=claude-mcp"` only on `open` commands for the floating
second-monitor rule, and passes `--confirm-actions "" --confirm-interactive false`
every time. Agents should save JSON from `window.__capLast` /
`window.__capBootLast` after calling `dump({ copy:false })` or
`bootDump({ copy:false })`.

## Repeatable local pipeline CLI

`bin/yoinkit` is the first small orchestration layer around
`bin/capture-browser`. It creates run folders, opens the target with the engine
injected, saves `__cap.map()`, runs manifest-defined captures, stores timeline
JSON, assembles `animations.json`, renders `animations.md`, and writes a compact
`report.md`. It also writes `page-state.json`, a small readiness log that records
whether the page looked ready, stuck behind a loader, or blocked by a challenge /
rate limiter before map and capture phases.

The recommended flow is two commands:

```bash
RUN="$(./bin/yoinkit scout https://mammothmurals.com/ | awk '/^Run:/ {print $2}')"
./bin/yoinkit yoink "$RUN"
```

`scout` creates the run folder, maps the page, and proposes a capture manifest.
Review `capture-plan.md` / `manifest.proposed.json`, edit selectors if needed,
then `yoink <run-dir>` runs those captures, assembles the yoinked motion spec,
and writes the report.

For a fully automatic pass, accepting the proposed plan without review:

```bash
./bin/yoinkit yoink https://mammothmurals.com/
```

Map workbench is in progress. The implemented stage-runner commands are:

```bash
RUN="$(./bin/yoinkit init https://mammothmurals.com/)"
./bin/yoinkit recon "$RUN"
```

`init` materializes the run shell only: `00-config.json` and the minimal
`page-model.json`, under `yoink-runs/<host>/<date>-<slug>/` unless `--run-dir`
is supplied. It resolves viewport shorthand and the primary viewport, then
stops. It does not open a browser, map the page, propose captures, or write
later-stage artifacts.

`recon` reads that run configuration, probes the configured viewport set, writes
`01-recon/` evidence, and updates only Recon-owned page-level facts in
`page-model.json`. It does not create Regions, motion candidates, Report output,
or later-stage artifacts.

The legacy prototype commands remain available when you want to step through or
rerun one capture phase:

```bash
./bin/yoinkit map runs/mammothmurals.com/2026-06-15-run
./bin/yoinkit plan runs/mammothmurals.com/2026-06-15-run
./bin/yoinkit capture runs/mammothmurals.com/2026-06-15-run manifest.proposed.json
./bin/yoinkit assemble runs/mammothmurals.com/2026-06-15-run
./bin/yoinkit report runs/mammothmurals.com/2026-06-15-run
```

You can also run all phases from a hand-authored manifest:

```bash
./bin/yoinkit run manifest.json
```

Artifacts are written under `runs/<domain>/<date>-<slug>/`:

```text
map.json
page-state.json
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

Manifest captures are deliberately small. The CLI supports `hover`, `click`,
`scroll` / `scroll-reveal`, and `boot` / `load`:

```json
{
  "url": "https://mammothmurals.com/",
  "viewport": [1280, 800],
  "captureStrategy": "reuse-page",
  "captureGroups": {
    "main-page-after-intro": { "resetScroll": true }
  },
  "captures": [
    {
      "id": "faq-accordion",
      "type": "click",
      "root": "div.g_faq_item.w-dyn-item",
      "action": "click div.g_faq_item.w-dyn-item",
      "fresh": true,
      "waitMs": 900
    },
    {
      "id": "hero-load",
      "type": "boot",
      "fresh": true,
      "seedReuse": true,
      "boot": { "selectors": ["h1", "[class*=split]"], "ms": 4000 },
      "waitMs": 4300
    }
  ]
}
```

For automation, the CLI always finalizes with `dump({ copy:false })` or
`bootDump({ copy:false })` and saves from the returned object. It does not read
from the clipboard.

By default, generated manifests use `captureStrategy: "reuse-page"`. The runner
opens a fresh page for `boot` / `load`, then can reuse that settled page for
ordinary hover, scroll, and manual captures in the same `group`. This avoids
replaying long intro overlays and avoids hammering a site with one full
navigation per capture. Per-capture controls:

- `fresh: true` forces a new page for that capture.
- `group: "name"` batches reusable captures on the same loaded page.
- `setupAction` runs before a capture, after any group setup.
- `resetAction` runs after a capture; click captures only reuse by default when
  they provide one.
- `reusePage: true` opts a stateful capture into reuse; `reusePage: false` opts
  out.
- `seedReuse: true` on a boot/load capture lets the settled post-load page seed
  a reusable group, usually `main-page-after-intro`.

Agents should edit these fields when the page demands judgment. For example, a
site with a long hero intro should do one boot/load capture, let it seed the
main group, and then run the hover/scroll captures on that settled page. A modal
or menu flow should either be `fresh: true` or include a reliable `resetAction`.

The assembler is intentionally conservative. Registry-backed ScrollTrigger
tweens and CSS loops are marked `measured`; CSS hover timings, callback-only
ScrollTriggers, and structural split reveals are marked `unknown - verify` until
a live timeline capture proves their deltas. Manifest captures can override
labels, mechanisms, notes, confidence, and pattern IDs when a human has better
context.

Empty captures are preserved as `unknown - verify` entries instead of crashing
assembly. Capture action failures are recorded with `status: "error"` and the
pipeline continues to the next manifest item. `report.md` calls these out under
**Empty Captures** or **Failed Captures** so selector misses, hidden elements,
covered hover points, and bad trigger recipes stay visible during calibration.

Before it maps or captures, the CLI waits for the page to become stable and
records the outcome. If the page appears rate-limited, captcha/challenge gated,
or otherwise blocked, it records that blocker and stops spending additional
visits on the target. Fresh opens are throttled by a small polite delay
(`--open-delay-ms`, default `750`) because a full run can otherwise look like a
burst of reloads to a production site. The readiness behavior can be tuned with
`--ready-timeout-ms`, `--ready-stable-ms`, or disabled with `--no-ready-wait`.

Hover/click captures also run a selector preflight. The CLI checks that the
target exists before scrolling, then verifies the hovered/clicked point is not
covered after scroll/settle. Preflight failures are saved as normal
`status: "error"` capture results, so a bad selector explains itself without
aborting the whole pipeline.

`plan` reads `map.json` and writes `manifest.proposed.json` plus
`capture-plan.md`. It proposes boot captures for split reveals, scroll captures
for callback-only ScrollTriggers, representative CSS hovers by timing group,
one tight accordion click when FAQ/accordion selectors are present, and a
deduped set of representative hover candidates. Review the generated selectors
before passing the proposed manifest to `capture`.

The planner applies a few conservative selector preferences learned from the
Mammoth calibration: prefer interaction owners over child decoration layers,
avoid generated Webflow node IDs and generic bare tags, derive accordion roots
from the mapped site selectors, click the best-looking accordion trigger while
scanning the item root, and treat obvious in-view marquees as manual loop
captures rather than scroll reveals.

## Two ways to load it

### 1. Unpacked extension (primary)

`extension/` is an MV3 extension whose content script runs early in the page's
MAIN world and defines `window.__cap` on **every page automatically** - no
pasting, ever. It also opportunistically instruments the page's own GSAP and
CustomEase globals when they exist, so captures can include source evidence such
as tween targets, duration, ease, stagger, and CustomEase path data. Edit
`extension/capture-animation.js` and the change is live on the next extension
reload.

Load it once:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `extension/` directory in this repo
3. `__cap` is now present on every page. After editing the engine, hit the
   **reload** ↻ on the extension card.

(Alternative: launch Chrome with `--load-extension=<repo>/extension`.)

### 2. DevTools Snippet (fallback)

When you can't load the extension, use the snippet:

```bash
./install.sh       # installs the engine + the `capture-snippet` helper
capture-snippet    # copies the engine to the clipboard
```

Then **DevTools (F12) → Sources → Snippets → New snippet → paste → Ctrl+S**, and
run it (Ctrl+Enter) on each page. Re-run `capture-snippet` and paste over after
editing the engine.

## Use — the toolbar button (easiest)

Click the extension's **toolbar button** (the crosshair). The cursor becomes an
element picker, like DevTools' Ctrl+Shift+C:

1. **Hover** the element so its animation plays (the picker highlights it).
2. **Click** it.

That captures the element's subtree and dumps the spec to the **console +
clipboard** in one gesture — no selectors, no navigation (the click is
swallowed). Press **Esc** to cancel. Same thing from the console: `__cap.pick()`.

The picker captures from the nearest interactive ancestor (`a` / `button`) so it
catches effects that live on a child you're not directly pointing at.

> After updating the extension you must **reload it** at `chrome://extensions`
> (the ↻ on its card) — manifest/background changes don't hot-reload like the
> content script does.

## Use — the console (full control)

```js
__cap.libs()                         // which animation libraries are loaded
__cap.on('.selector')                // capture one element on hover (default)
__cap.on('.sel', {trigger:'scroll'}) // capture on scroll-into-view
__cap.scan('.section')               // diff-scan: find what moves in a region
__cap.scan($0)                       // capture the element selected in Elements
__cap.gsap()                         // inspect logged GSAP/CustomEase evidence
__cap.dump()                         // finalize -> returns + copies the spec JSON
__cap.dump({ copy:false })           // automation-safe: no clipboard write
```

Triggers: `hover` (default) · `scroll` · `load` · `manual`. Tip: `$0` is the
element currently selected in the Elements panel — handy for `on`/`scan`.

For load-time reveals, use the boot recorder. It watches likely elements for a
fixed early window and can be auto-started from an init script:

```js
__cap.boot({ selectors: ['h1', '[class*=split]', '[class*=hero]'], ms: 4000 })
__cap.bootDump()
__cap.bootDump({ copy:false }) // automation-safe
```

When using `agent-browser --init-script`, a tiny config init script can set
`window.__capAutoBoot` before loading the engine:

```js
window.__capAutoBoot = { selectors: ['h1', '[class*=split]'], ms: 4000 }
```

### When to use `on` vs `scan`

- `__cap.on(sel)` tracks one element (and auto-detects split-text stagger when
  it has many similar children). Use it when you can name the exact element.
- `__cap.scan(root)` snapshots every element under `root` and reports the ones
  whose style changes during your interaction. Use it when the animation lives
  on a **descendant** of what you can target, or on a layer you can't click
  (`pointer-events:none`, sitting behind text). This is the robust default for
  anything non-obvious.

### Capturing reliably (learned the hard way)

- **The animation must actually be running during the capture window.** Some
  sites gate effects behind scroll/in-view state; make sure it's playing before
  `dump()`. For a one-shot transition the reliable recipe is:
  **settle → arm (`on`/`scan`) → trigger → wait the duration → `dump()`**.
- **Hover triggers need the cursor to *cross into* the element.** If the pointer
  is already over it, no `mouseenter` fires and nothing records. Move away
  first, then hover.
- **A real browser is required.** Headless/synthetic events usually don't fire
  framework hover/scroll handlers (Webflow IX2, GSAP), and the headless
  compositor may not advance transitions. Drive it in a real, rendered tab.
- **Ambiguous selectors bite.** `querySelector` takes the first match in the
  document, which may not be the one on screen. Prefer a unique selector or use
  `scan` on a specific container element.
- 3D-matrix rotation decomposition is approximate (flagged `_approx3d`). The raw
  matrices and translate/scale are exact; treat Euler angles as close-but-verify.
- GSAP easing is not visible in computed style, but the engine now logs GSAP
  calls made after it is injected. When that evidence is present, prefer the
  logged `duration`, `ease`, `stagger`, and target data over curve guessing.
  CSS-transition easing is still read authoritatively from computed style.

## Files

- `extension/manifest.json` — MV3 extension (toolbar action + MAIN-world content
  script + service worker).
- `extension/capture-animation.js` — the engine + picker (single source of truth,
  used by both the extension and the snippet fallback).
- `extension/background.js` — service worker; toolbar click toggles the picker.
- `extension/icons/` — toolbar/extension icons (generated from `icon.svg`).
- `bin/capture-snippet.sh` — clipboard helper for the DevTools-snippet fallback.
- `install.sh` — installs the engine to `~/.local/share/yoinkit/` and
  `capture-snippet` to `~/.local/bin/`.

## License

MIT — see [LICENSE](LICENSE).
