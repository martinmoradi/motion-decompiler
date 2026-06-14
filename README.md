# motion-decompiler

**A web-animation decompiler.** It reads what an animation *actually does* by
sampling computed style every frame — regardless of how it is driven: CSS
transitions/keyframes, GSAP inline transforms on `requestAnimationFrame`, or CSS
sprite `steps()`. The built-in DevTools **Animations** panel only sees CSS/WAAPI
animations, so it shows nothing for GSAP- or canvas-driven motion; this sees
everything because it reads the rendered result.

The output is a **spec, not code**: detected libraries, a one-line plain-English
`summary` of the whole animation, and a `findings` array — each animating layer
with its measured timing/easing and a frame-by-frame timeline. Capturing is the
tool's job; **writing the recreation is the LLM's job** — hand the spec to a
coding agent (paste it, or use it from the console) and it builds a faithful
version in your stack. `dump()` returns the spec and copies the pure JSON to the
clipboard.

It's designed to feed AI coding agents a two-part workflow: **map** a page
cheaply (structure, stack, selectors), then **capture** the motion of the pieces
that matter and recreate them. The capture must run in a real, rendered browser
(headless synthetic events don't fire most hover/scroll handlers).

## Two ways to load it

### 1. Unpacked extension (primary)

`extension/` is an MV3 extension whose content script runs in the page's MAIN
world and defines `window.__cap` on **every page automatically** — no pasting,
ever. Edit `extension/capture-animation.js` and the change is live on the next
extension reload.

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
__cap.dump()                         // finalize -> returns + copies the spec JSON
```

Triggers: `hover` (default) · `scroll` · `load` · `manual`. Tip: `$0` is the
element currently selected in the Elements panel — handy for `on`/`scan`.

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
- GSAP/canvas easing can't be read back (no CSS to inspect); it's marked
  `unknown — verify`. CSS-transition easing *is* read authoritatively.

## Files

- `extension/manifest.json` — MV3 extension (toolbar action + MAIN-world content
  script + service worker).
- `extension/capture-animation.js` — the engine + picker (single source of truth,
  used by both the extension and the snippet fallback).
- `extension/background.js` — service worker; toolbar click toggles the picker.
- `extension/icons/` — toolbar/extension icons (generated from `icon.svg`).
- `bin/capture-snippet.sh` — clipboard helper for the DevTools-snippet fallback.
- `install.sh` — installs the engine to `~/.local/share/motion-decompiler/` and
  `capture-snippet` to `~/.local/bin/`.

## License

MIT — see [LICENSE](LICENSE).
