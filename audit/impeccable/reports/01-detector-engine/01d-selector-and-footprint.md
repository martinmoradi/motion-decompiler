# Detector deep dive 01d — selector generation, text-rect, and footprint scrubbing

Companion to [`01-detector-engine.md`](01-detector-engine.md). These are the parts
of the in-page engine that map most directly onto YoinkIt primitives: selector
generation is `pick()` emitting a stable target for `on(sel)`; footprint scrubbing
is `scan()`/`dump()` not measuring YoinkIt's own toolbar; the text-rect helper is
"measure the thing that moved, not its container." All of it is small and lifts
cleanly.

File: [`browser/injected/index.mjs`](../../source/cli/engine/browser/injected/index.mjs)
unless noted.

---

## 1. Self-stabilizing selector generation

YoinkIt's contract is "drive by selector, never coordinates," because captured page
coordinates drift with viewport. Impeccable generates exactly the kind of selector
that contract needs: one that survives reloads and build-mangled class names.

### 1.1 Drop the noise — `isLikelyHashedClass` (line 491-497)

Before a class can go in a selector it must survive this filter:

```js
function isLikelyHashedClass(c) {
  if (!c) return true;
  if (/^(css|sc|emotion|jsx|module)-[\w-]{4,}$/i.test(c)) return true;  // CSS-in-JS
  if (/^_[\w-]{5,}$/.test(c)) return true;                              // _2x4hG_ modules
  if (/^[a-z0-9]{6,}$/i.test(c) && /\d/.test(c)) return true;           // alnum+digit hash
  return false;
}
```

This drops `css-1a2b3c` (styled-components/emotion), `_2x4hG_` (CSS modules), and
generic alnum hashes that contain a digit. Those change between builds, so a
selector built on them is brittle. This is the key insight: a stable selector is
built from the classes a human would recognize, not the ones a bundler generated.

### 1.2 One segment — `buildSelectorSegment` (line 499-528)

```js
tag                                              // always the tag
  + (up to 2 non-impeccable, non-hashed classes, CSS.escape'd)
  + ':nth-of-type(n)'  // ONLY if parent has >1 match of `:scope > <segment>`
```

It adds at most two surviving classes, then disambiguates among siblings with
`:nth-of-type` **only when needed** (the parent actually has more than one match of
the partial segment). If `:scope`/`querySelectorAll` throws, it falls back to
`:nth-child`.

### 1.3 The whole path — `generateSelector` (line 530-563)

```js
if (el === document.body) return 'body';
if (el === document.documentElement) return 'html';
if (el.id) return '#' + CSS.escape(el.id);          // an id is decisive, stop
// else walk up, unshifting segments:
while (current && current !== body/html && depth < 10) {
  parts.unshift(buildSelectorSegment(current));
  if (current.id) { parts[0] = '#'+CSS.escape(current.id); break; }  // anchor on ancestor id
  const trySelector = parts.join(' > ');
  if (document.querySelectorAll(trySelector) is exactly [el]) return trySelector;  // stop at unique
  current = current.parentElement; depth++;
}
return parts.join(' > ');
```

Four properties make it robust:

1. **`id` is decisive.** If the element or any ancestor has an id, the selector
   anchors there and stops walking. Ids survive builds; hashed component classes do
   not.
2. **It stops as soon as the partial selector is unique.** It does not build the
   full root-to-leaf path; it adds ancestors only until `querySelectorAll` returns
   exactly the target. Shorter selectors are more stable.
3. **It is depth-capped at 10** so a deep tree cannot produce a monstrous selector.
4. **`> ` child combinators**, not descendant, so an inserted wrapper elsewhere
   does not silently change what matches.

### 1.4 The selector round-trip (the robustness move)

The selector is not trusted as a permanent handle. Every consumer **re-resolves it
live and detects staleness**:

- `analyzeVisualContrastCandidate` does `document.querySelector(candidate.selector)`
  and returns `{status:'unresolved', reason:'stale selector'}` if it throws, or
  `'missing element'` if it is gone ([:1090-1094](../../source/cli/engine/browser/injected/index.mjs)).
- `captureVisualContrastCandidate` (Tier 3 screenshot) re-resolves the selector
  inside `page.evaluate` and bails if not found
  ([`screenshot-contrast.mjs:118-150`](../../source/cli/engine/engines/visual/screenshot-contrast.mjs)).
- `addVisualContrastResult` re-resolves before decorating
  ([:1624-1630](../../source/cli/engine/browser/injected/index.mjs)).

So a candidate generated at scan time is re-grounded at use time, and a DOM that
moved between the two produces an honest `stale selector` rather than a wrong
measurement. This is the detector's lighter-weight cousin of live mode's dual
locator (durable structural ref + tolerant text-needle snapshot, re-resolved
id-first after an HMR reload), documented in
[`03d-overlay-picker-and-locators.md`](../03-live-mode/03d-overlay-picker-and-locators.md).

---

## 2. Measure the text, not the box — `getDirectTextRect` (line 572-598)

A subtle, lift-worthy helper. To measure contrast it needs the bounding box of the
element's **own text glyphs**, not the element's layout box (which may include
padding, child blocks, whitespace). It uses DOM `Range` over each direct text node:

```js
for (const node of el.childNodes) {
  if (node.nodeType !== 3 || !node.textContent.trim()) continue;
  const range = document.createRange();
  range.selectNodeContents(node);
  for (const rect of range.getClientRects())
    if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
  range.detach?.();
}
// union of all text-line rects → the real text box
```

It unions the per-line client rects of the direct text nodes into one box, ignores
descendant text, and feature-detects `range.detach`. The contrast samplers
(Tier 2 and Tier 3) clip and sample against this text box, so they sample where the
glyphs actually are, not where the container is.

**For YoinkIt:** this is directly relevant to "measure what actually moved." When a
captured element animates, the moving thing is often the text or an inner layer, not
the element's full box. Range-based measurement of the real painted extent is a
cleaner basis for per-frame deltas than `getBoundingClientRect` on the container.

---

## 3. Footprint scrubbing — never measure yourself

An engine injected into arbitrary pages must not measure its own injection, or it
reports the tool instead of the page. Impeccable scrubs its footprint in three
places, and even extends the courtesy to *other* tools.

### 3.1 Skip own + other extensions' nodes (collectBrowserFindings, line 1466-1476)

```js
for (const el of document.querySelectorAll('*')) {
  if (el.closest('.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip')) continue;
  const elId = el.id || '';
  if (elId.startsWith('claude-') || elId.startsWith('cic-')) continue;   // Claude-in-Chrome
  if (el.closest('[id^="impeccable-live-"]')) continue;                  // live-mode overlay
  if (el === document.body || el === document.documentElement) continue;
  ...
}
```

It skips its own overlay chrome, its own live-mode inspector, **and** Claude-in-Chrome
nodes (`claude-`, `cic-` id prefixes). The quality check repeats the `claude-`/`cic-`
skip ([`checks.mjs:1353-1354`](../../source/cli/engine/rules/checks.mjs)). This explicit
coexistence with another in-page agent is notable: it is the same situation YoinkIt
is in, running alongside agent-browser and Claude-in-Chrome.

### 3.2 Clone and strip before the regex pass (line 1554-1558)

The regex-on-HTML checks (`checkHtmlPatterns`) run on the page's `outerHTML`, which
would include the inspector's own injected inline styles (transitions on
top/left/width/height, etc.) and self-trigger `layout-transition` and friends. So it
clones the document element, removes its own live-mode nodes, and scans the clone:

```js
const docClone = document.documentElement.cloneNode(true);
for (const node of docClone.querySelectorAll('[id^="impeccable-live-"]')) node.remove();
const htmlPatternFindings = checkHtmlPatterns(docClone.outerHTML);
```

### 3.3 The serialized shape (serializeFindings, line 1212-1233)

When findings cross back to Node (extension/Puppeteer), each is serialized with
exactly the fields a consumer needs and nothing internal:
`{ selector, tagName, rect (or null for page-level), isPageLevel, isHidden,
findings: [{ type, category, severity, detail, ignoreValue, name, description }] }`.
The selector is the round-trippable handle from §1; `rect` is `toJSON`'d;
`isHidden` is computed with `el.checkVisibility?.()` and an `offsetWidth` fallback
([:1205-1210](../../source/cli/engine/browser/injected/index.mjs)).

---

## 4. The namespaced window API

The engine exposes itself as `window.impeccable*` (line 1930-1936), structurally the
same pattern as YoinkIt's `window.__cap`:

```js
window.impeccableDetect = detect;            // collect, return serialized findings
window.impeccableScan = scan;                // collect + decorate overlays
window.impeccableScanAsync = scanAsync;      // + visual contrast (async)
window.impeccableCollectVisualContrastCandidates = collectVisualContrastCandidates;
window.impeccableAnalyzeVisualContrast = analyzeVisualContrast;       // Tier 2 entry
window.impeccableGetLastVisualContrastAnalyses = () => [...];
```

In extension mode the engine does **not** auto-scan. It announces
`window.postMessage({source:'impeccable-ready'})` and waits for a command
([:1855-1928](../../source/cli/engine/browser/injected/index.mjs)). That `ready`
handshake is the fix for the "tried to use the engine before it loaded" race, which
is the exact failure mode of YoinkIt's "arm before `__cap` exists" (covered for the
extension surface in [`02-chrome-extension.md`](../02-chrome-extension/02-chrome-extension.md)).

---

## 5. What this means for YoinkIt

- **STEAL `generateSelector` + `buildSelectorSegment` + `isLikelyHashedClass`
  almost verbatim into `pick()`.** This is the concrete implementation of "drive by
  selector, never coordinates." Drop hashed classes, anchor on id, stop at unique,
  child combinators, depth cap. It emits the stable selector `on(sel)` needs to
  survive across runs and viewports.
- **STEAL the round-trip discipline.** Never trust a stored selector as a permanent
  handle. Re-resolve it at use time and surface `stale selector` honestly. For
  YoinkIt's timed-capture recipe (settle, arm, trigger, wait, dump), the element can
  move between arm and trigger; re-resolving beats trusting the arm-time ref. The
  stronger version (dual locator with text-needle fallback) is in
  [`03d`](../03-live-mode/03d-overlay-picker-and-locators.md), worth reading before building `on(sel)`.
- **STEAL footprint scrubbing into `scan()`/`dump()`.** Exclude YoinkIt's own
  toolbar and injected markers, and (cheaply) skip agent-browser and
  Claude-in-Chrome nodes by id prefix, so a capture never measures the tool. The
  clone-and-strip-before-regex move is the right pattern any time the engine reads
  raw `outerHTML`.
- **ADAPT `getDirectTextRect` for "what moved."** Range-based measurement of the
  real painted extent of an element's own content is a better basis for per-frame
  motion deltas than the container's bounding box.
- **STEAL the `ready` handshake** for the extension surface to make arming
  deterministic instead of timing-based.

Back to the architecture overview: [`01a`](01a-rule-trinity-and-dispatch.md). The
cascade is [`01b`](01b-css-cascade-engine.md); the contrast tiers are
[`01c`](01c-color-and-contrast-tiers.md).
