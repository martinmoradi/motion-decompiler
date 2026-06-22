# Design-memory deep dive 06d — a measured `motion.json` for YoinkIt

Companion to [`06-design-memory.md`](06-design-memory.md). The three prior slices
read Impeccable's **authored** design memory to the floor: the artifact
([`06a`](06a-the-persisted-artifact.md)), how it is written and migrated
([`06b`](06b-generation-and-migration.md)), how it is read back and enforced
([`06c`](06c-the-enforcement-reader.md)). This one is the payoff: a concrete,
written-out **measured** motion memory for YoinkIt — a durable, versioned,
git-tracked `motion.json` that crystallises `__cap.dump()` observations into a
site's reusable, enforceable motion language.

This is a *measured* counterpart, not a port. Where Impeccable's `design.json` is
an LLM writing down the design a project *should* follow, YoinkIt's `motion.json`
is the engine writing down what a site *actually does*, frame by frame. The whole
file holds that inversion (06 survey lines 180-186; §6, "the catch").

Sibling slices feed this one:
- the outer frame to copy (`schemaVersion`/`generatedAt`/optional blocks, the
  `.yoinkit/` directory, the `{name,value,purpose}` interop row) →
  [`06a`](06a-the-persisted-artifact.md)
- the lifecycle to copy and the synthesis to drop → [`06b`](06b-generation-and-migration.md)
- the allowed-set/tolerance linter to invert → [`06c`](06c-the-enforcement-reader.md)

YoinkIt references are into the repo root (`CONTEXT.md`, `docs/ARCHITECTURE.md`,
`docs/CONTRACT.md`, `extension/capture-animation.js`); Impeccable references are
into `../../source/`. All line numbers re-verified this session. Tags follow the
survey's own scheme: **ADOPT** (a pattern/schema to take), **EXPLORE** (worth
prototyping), **INSPIRATION** (a stance to internalise).

> **Verification note (re-checked against live source this session).** Every
> `file:line` in this slice was re-read — the YoinkIt engine
> (`extension/capture-animation.js`), the contracts (`CONTEXT.md`,
> `docs/CONTRACT.md`, `docs/ARCHITECTURE.md`), the archived legacy schema, and the
> Impeccable mechanism being inverted (`design-system.mjs`). The draft's citations
> held; three engine-side precision points the first pass rounded off, each fixed
> below so a future implementer folds the *real* output, not a sketch of it:
>
> - **`report.stagger` is `null` when fewer than 3 transform layers move**
>   (`staggerSummary:780-781`), not `0`; when present it is
>   `{ items, staggerMs, order[] }` (`:814-815`). The fold reads a `null`-or-object,
>   never a number. (§2, §4)
> - **`mechanism` is the *lead* property, chosen by a priority list, not "the first
>   of 10."** `leadProperty = LEAD_PROPS.find(p => properties[p]) || changed[0]`
>   (`:740`); `LEAD_PROPS` (`:39-40`) is the same 10 members as `PROPS` (`:37-38`)
>   reordered by salience (`transform` before `opacity` before `filter` …). So
>   `mechanism ∈ PROPS` still holds — it is a clean 10-value enum (§7) — but the
>   value is the *salient mover*, not an arbitrary pick. (§2, §4)
> - **The engine's measured `trigger` enum is smaller than the domain `Trigger`.**
>   `meta.trigger ∈ {hover, scroll, load, manual}` (header `:27`, assigned `:639`,
>   emitted `:1350`); the domain `Trigger` is `{hover, scroll, click,
>   cursor-follow, …}` (`CONTEXT.md:242`). `motions[].trigger` and
>   `coverage.triggersSeen` fold from the *engine* enum, so the linter's
>   `motion-off-trigger` set (§7) must speak that vocabulary, not the domain one —
>   a precision trap worth a comment in the code.

---

## 1. Where YoinkIt is today: the gap this artifact fills

YoinkIt has no durable motion memory. Three documented facts pin the gap:

- **Captures are per-run and throwaway.** A capture finalises to a
  `*.animation.json` that is **gitignored** — `CLAUDE.md` is explicit: "Don't
  commit local captures (`*.animation.json`) — they're gitignored." The current
  contract stores capture passes under a per-run directory
  `yoink-runs/{host}/{yyyy-mm-dd}-{slug}/` (`docs/CONTRACT.md:41-43`), as numbered
  passes `05-capture/passes/pass-001/pass.json` merged into one
  `page-model.json` (`docs/CONTRACT.md:71-78`, `:1078-1097`).
- **There is no cross-run relationship.** Passes accrete **within** a run
  (`CONTEXT.md:254-261`, "Passes accrete"; the Report "accretes across capture
  passes", `CONTEXT.md:103`), but each `yoink-runs/{host}/{date}-{slug}/` is
  independent. Nothing accumulates a *site's* motion language across captures or
  sessions.
- **The emitted Spec has no concrete schema.** The machine-facing projection
  `06-spec/spec.json` is defined only abstractly — a "must preserve" bullet list
  (`docs/CONTRACT.md:1099-1112`), with no field-level shape. The richest field
  vocabulary YoinkIt has ever written down (`tokens`, `patterns`,
  `animations[].lead{from,to,duration,ease,easeBezier}`, `confidence`,
  `timelineRef`) lives in the **legacy, archived** `docs/archive/legacy-capture-pipeline/SPEC.md:143-181`,
  which `CLAUDE.md` demotes to "historical background only."

So YoinkIt — a *motion* tool — has exactly the durable, committed, accumulating
motion artifact that Impeccable — a *static design* tool — already ships
([`06a`](06a-the-persisted-artifact.md)). That is the inversion the survey leads
with, and it is real: the gap is not a missing feature, it is a missing **object**.

What YoinkIt *does* already have, and what this proposal builds on rather than
invents:

| YoinkIt already owns | Where | Role in `motion.json` |
|---|---|---|
| `confidence: measured \| verify \| unknown` | `CONTEXT.md:140-145` | the per-token honesty marker; the measured-vs-authored axis, already built |
| `Signature` (load-bearing vs incidental) | `CONTEXT.md:19-22` | the seed of the motion `register` tag (§6) |
| `importance: signature/useful/polish/ignore` (on Notes) | `CONTEXT.md:250-251` | the per-motion register value (§6) |
| `Trigger` (hover/scroll/click/cursor-follow) — a *measured* field | `CONTEXT.md:242-246` | a first-class measured key on each motion (§4) |
| `Note` — human intent, never mechanics | `CONTEXT.md:248-252` | the source of the motion `narrative` (§5) |
| `Region` — a stable spatial home for captures | `CONTEXT.md:76-83` | the grouping key motions accumulate under (§3) |
| `schemaVersion` on every artifact | `docs/CONTRACT.md:119-123` | already the house convention; stamp `motion.json` the same |

The point of the table: nearly every field this proposal needs is **already a
YoinkIt word**. The new object is mostly a durable *home* for vocabulary YoinkIt
measures today and throws away.

### Where the new object sits — the pipeline is per-*run*, the memory is per-*site*

The gap is structural, not just a missing file, and it is worth seeing exactly. The
entire YoinkIt run contract lives under **one run directory**
(`yoink-runs/{host}/{date}-{slug}/`, `docs/CONTRACT.md:41-43`) with seven numbered
stages (`docs/CONTRACT.md:53-89`):

```
yoink-runs/{host}/{date}-{slug}/      ← one run; nothing survives it as a site memory
├── 00-config.json                    ← skill⇄CLI interface (CONTRACT.md:110)
├── 01-recon … 04-map-report/         ← the Map (structure, regions, motion-scout)
│   └── 03-motion-scout/{motion-candidates,coverage,assertions}.json   ← per-run motion coverage already exists
├── 05-capture/passes/pass-001/pass.json   ← a capture pass, merged into page-model
│   └── results.json
├── 06-spec/spec.json                 ← machine projection of page-model (CONTRACT.md:1099)
└── 07-implement/{motion-map.md,motion-assertions.json}   ← per-run motion gate already exists
```

`page-model.json` is the **canonical** artifact; Report and Spec are projections of
it, never hand-authored in parallel (`docs/CONTRACT.md:94-99`). But every path above
is scoped to *one run of one URL on one day*. A capture pass "enriches Regions in the
Page model" and is then merged in (`docs/CONTRACT.md:1080-1082`) — **within the run**.
Nothing reads across `yoink-runs/` to build a *site's* motion language. Re-yoink the
same site next month and you start from an empty page-model again.

So `motion.json` is not a new stage inside the run — it is the **missing tier above
it**: a per-site, repo-committed accumulator at `.yoinkit/motion.json` (the
`.yoinkit/` home [`05c`](../05-hook-system/05c-config-and-ignore-model.md) and
[`06a`](06a-the-persisted-artifact.md) §1 point at), exactly as Impeccable's
`.impeccable/design.json` sits *above* any single `/impeccable detect` run. The fold
(§4) is the lift: it reads the per-run measured motion (the `__cap.dump()` spec, or
equivalently the merged `page-model.json` motion items) and folds it **up** into the
durable per-site memory. The directory inversion in one line:

| | Impeccable | YoinkIt today | YoinkIt with `motion.json` |
|---|---|---|---|
| **per-site memory** | `.impeccable/design.json` (committed) | *(none)* | `.yoinkit/motion.json` (committed) |
| **per-run work** | a `detect` invocation (ephemeral) | `yoink-runs/{…}/` (gitignored captures) | `yoink-runs/{…}/` unchanged; folds up |

Two things this placement buys, both already half-built in the contract:

- **Staleness is a *hash*, not a guess.** The contract already has gate projections
  carry "input hashes for freshness" — hashes of `page-model.json`, recon page state,
  Static-Map measurements (`docs/CONTRACT.md:129-134`). `motion.json`'s
  `sourceChangedSinceCapture` (§3) is that same discipline lifted to the site tier: a
  stored source hash vs the live page, not the mtime heuristic Impeccable settled for
  ([`06b`](06b-generation-and-migration.md) §7). YoinkIt can do *better* than the tool
  it is borrowing from here.
- **Per-run motion coverage/assertions already exist to lift.** `03-motion-scout`
  emits `coverage.{md,json}` and `assertions.json`; `07-implement` emits
  `motion-assertions.json` and `motion-map.md` (`docs/CONTRACT.md:61-65,84-88`). The
  proposal is not foreign machinery — it is those per-run motion artifacts promoted to
  a durable, accumulating site memory and a linter that reads it. (The linter §7 is the
  `motion-assertions.json` gate, sourced from memory instead of from this-run's spec.)

---

## 2. The measured spec YoinkIt produces today (`__cap.dump()`)

The input to `motion.json` is the live engine's output. The exact shape, from the
real `dump()` (`extension/capture-animation.js:1344-1368`):

```js
const report = {
  meta: {
    source: location.href,
    capturedFrom: 'capture-animation.js',
    libraries: detectLibs(),
    mode: S.mode,
    trigger: S.trigger,                 // 'hover' | 'scroll' | 'load' | 'manual'  (header :27)
    captureSource, terminationReason,
    sampledProperties: [...PROPS],      // the 10 props, :37-38
    sampledPseudoElements: [...PSEUDO_ELEMENTS],
    rootSelector, rootLocator,
    durationMs: captureDuration(),
    elementsMoved: findings.length,
    instrumentation: { gsap, customEase },
  },
  evidence,                             // { gsap: {...} }  source-level GSAP/CustomEase evidence
  summary: summarize(findings, stagger),// plain-English, :827
  stagger,                              // { items, staggerMs, order[] } or NULL  (staggerSummary :779,:814)
  findings,                             // per-layer (below)
};
window.__capLast = report;              // :1377
```

Each `findings[]` entry (the per-layer analysis, `analyze:726-756`):

```js
{
  selector, locator, frameCount,
  pseudoElement?,                       // ::before / ::after layer
  leadProperty,                         // the driving property
  properties: { [prop]: { from, to, timing:{duration,easing}, technique, timeline, rawFrames } },
  type, from, to,
  timing: { duration, easing },         // authoritative cssTiming :457, else measuredTiming :665
  technique,                            // e.g. "scale 1.1->1"
  timeline,                             // downsampled per-frame samples
}
```

Three properties of this output that the memory must preserve faithfully:

- **The honesty is a fallback in one line of code, not a flag.** Per-property
  timing is `cssTiming(el, prop, pseudo) || measuredTiming(f)`
  (`propertyAnalysis:688`). `cssTiming` (`:444-458`) reads the *authoritative*
  declared `transition-duration`/`-timing-function` off computed style and returns
  `{duration, easing}` (`:457`) — but only if a matching `transition-property` is
  declared and its duration is not `0s` (`:451,456`); otherwise it returns `null`.
  The `|| measuredTiming(f)` (`:665-668`) then emits
  `{ duration: "0.65s (measured)", easing: "unknown (rAF/JS) — verify" }`. So the
  difference between a *confident* CSS-transition reading and a *to-verify* rAF/JS
  reading is which side of that `||` fired — and it is recorded **inline in the
  value string**, not in a separate field. This is precisely why the fold can
  derive `confidence` deterministically (§4): the string `"… verify"` or the
  `"(measured)"` suffix *is* the confidence signal. `motion.json` lifts that magic
  string into a structured `confidence` field (§3) so downstream code never has to
  substring-match it.
- **It samples a fixed property set.** `PROPS` (`:37-38`) is
  `transform, opacity, filter, clipPath, backgroundSize, backgroundPosition,
  backgroundColor, color, height, width` — 10 properties. `mechanism` is the
  *lead* property: `LEAD_PROPS.find(p => properties[p]) || changed[0]` (`:740`),
  where `LEAD_PROPS` (`:39-40`) is those same 10 reordered by salience. A motion's
  `mechanism` is therefore always one of those 10 — a clean enum for the linter
  (§7) — and it is the *driving* property, the one a recreation must get right.
- **`stagger` is `null` until ≥3 transform layers move.** `staggerSummary` (`:779`)
  bails with `null` when fewer than three findings are transforms (`:780-781`); when
  it fires it returns `{ items, staggerMs, order[] }` (`:814-815`), where `order` is
  the layer indices sorted by first-movement time. The fold must treat `stagger` as
  nullable (§4) — a two-layer reveal legitimately has no stagger, and that is a
  measured fact, not a gap.

---

## 3. The proposed artifact: `.yoinkit/motion.json`

Committed, versioned, accumulating, one file in a `.yoinkit/` directory (the
home [`05c`](../05-hook-system/05c-config-and-ignore-model.md) and
[`06a`](06a-the-persisted-artifact.md) §1 both point at). The literal shape:

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-19T12:00:00Z",        // last write; the freshness baseline (§7 staleness)
  "title": "Motion memory: mammothmurals.com",
  "source": { "url": "https://mammothmurals.com/", "host": "mammothmurals.com" },

  // ── the reusable motion VOCABULARY: recurring measured values lifted to names.
  //    Each easing/duration row is ALSO a valid Impeccable extensions.motion token
  //    ({name,value,purpose}); the extra fields are measured extensions Impeccable
  //    ignores. This is the interop seam (§5).
  "tokens": {
    "easings": [
      {
        "name": "ease-signature",
        "value": "cubic-bezier(0.16, 1, 0.3, 1)",   // interop: {name,value,purpose}
        "purpose": "Site reveal/hover feel (expo-out). The brand's motion fingerprint.",
        "confidence": "measured",                    // measured | verify | unknown  (CONTEXT.md:140)
        "observedIn": 6,                             // # of motions that used it — why it earned a name
        "aliases": { "gsap": "expo.out" }            // source-evidence aliases (capture-animation.js evidence)
      }
    ],
    "durations": [
      { "name": "dur-reveal", "value": "650ms", "purpose": "Hero and card reveals.", "confidence": "measured", "observedIn": 4 },
      { "name": "dur-state",  "value": "150ms", "purpose": "Hover/active state feedback.", "confidence": "measured", "observedIn": 9 }
    ]
  },

  // ── the accumulated MOTIONS: one folded __cap finding each, grouped by Region,
  //    referencing tokens by name. This array is what grows across captures (§4).
  "motions": [
    {
      "id": "work-card-hover",                       // stable kebab-case (legacy SPEC.md convention)
      "label": "Work card cover reveal on hover",
      "region": "work-grid",                         // YoinkIt Region id (CONTEXT.md:76); the spatial home
      "trigger": "hover",                            // measured (CONTEXT.md:242); from dump meta.trigger
      "mechanism": "transform",                      // from finding.leadProperty (one of the 10 PROPS)
      "selector": ".work_home_item_link",
      "locator": { "uniqueSelector": "…", "shortSelector": "…" },  // from finding.locator (resolve live)
      "timing": {
        "duration": "dur-reveal", "easing": "ease-signature",      // token REFS (resolve via tokens[])
        "durationLiteral": "650ms",                                // the measured ground truth, NEVER dropped
        "easingLiteral": "cubic-bezier(0.16, 1, 0.3, 1)"           //   (legacy lead.ease + lead.easeBezier, both kept)
      },
      "from": { "scale": 1.1 }, "to": { "scale": 1 },              // from finding.from / finding.to
      "technique": "scale 1.1->1",                   // from finding.technique
      "layers": 6,                                   // from findings.length within the gesture
      "stagger": { "items": 5, "staggerMs": 125, "order": [0,2,1,3,4] },  // from dump.stagger, or null if <3 layers
      "confidence": "measured",                      // worst confidence across the gesture's layers
      "register": "signature",                       // signature | incidental — preserve vs normalise (§6)
      "viewport": "desktop",                         // primary-viewport-first (CONTEXT.md:65-74)
      "timelineRef": "timelines/work-card-hover.json",  // raw frames on disk, not inlined (CONTEXT.md:123)
      "clipRef": "clips/work-card-hover.mp4",        // optional Clip — pixels, not numbers (CONTEXT.md:147)
      "note": "The signature gesture — the page is built around this reveal.",  // human intent (CONTEXT.md:248)
      "provenance": {
        "capturedAt": "2026-06-18",
        "runId": "yoink-runs/mammothmurals.com/2026-06-18-work",
        "engine": "capture-animation.js",
        "captureSource": "automated"                 // automated | observe (CONTEXT.md:219)
      }
    }
  ],

  // ── human-intent prose, the measured analog of design.json.narrative (§5).
  "narrative": {
    "signature": "The identity is the expo-out cover reveal on the work grid; everything else is restrained state feedback.",
    "notes": [
      { "motion": "work-card-hover", "importance": "signature", "body": "Watch the cover, not the caption. This is the point." }
    ]
  },

  // ── what the memory does and does not yet know — thinness is shown, never faked (§6, §9).
  "coverage": {
    "regionsCaptured": 3,
    "regionsTotal": 7,                               // from the Map's place-first page model
    "viewports": ["desktop"],
    "triggersSeen": ["hover", "scroll"],             // the ENGINE trigger enum (hover|scroll|load|manual), not the domain one
    "sourceHash": "sha256:…",                        // hash of the captured source (CONTRACT.md:129-134 freshness pattern)
    "sourceChangedSinceCapture": false,              // stored sourceHash vs live page — better than mtime (06b §7)
    "unknowns": [                                    // honest gaps: legacy unspecced[]; CONTRACT pass "null + reason" (:1094)
      { "region": "footer", "reason": "not yet captured" },
      { "motion": "nav-underline", "reason": "easing unreadable (rAF/JS) — confidence: verify" }
    ]
  }
}
```

The structural choices, each grounded:

- **`tokens` (vocabulary) vs `motions` (instances)** is the legacy
  `animations.json` split (`tokens` + `animations[]`,
  `docs/archive/legacy-capture-pipeline/SPEC.md:143-181`) made durable. A value
  earns a token only after it recurs (`observedIn >= 2`); a one-off easing stays
  inline on its motion. This is "recurring values lifted to reusable names"
  (legacy `SPEC.md:152-156`), now persisted across captures.
- **Motions reference tokens by name** (`timing.duration: "dur-reveal"`), exactly
  as legacy `animations[].lead.ease` referenced `"ease.signature"`. The linter
  (§7) reads the token table as the allowed vocabulary, mirroring how
  `design-system.mjs` reads `colorMeta.canonical` + ramps into `allowedColorKeys`
  ([`06c`](06c-the-enforcement-reader.md) §2).
- **Grouped by `Region`** (`CONTEXT.md:76-83`), not a flat global list — YoinkIt's
  place-first model. A region is the stable spine motions accumulate under.
- **Frames are referenced, never inlined** (`timelineRef`), per the Spec rule that
  the machine projection "references Clip paths but never inlines frames"
  (`CONTEXT.md:123-129`). The memory stays compact and diff-able; the heavy frame
  data lives on disk.
- **Every motion and token carries `confidence`** — the field YoinkIt already
  defined (`CONTEXT.md:140-145`). This is the structural enforcement of the
  inversion: a token cannot exist without a measurement behind it (§6).
- **A token is an *index*, not a *replacement* — the memory stays lossless at the
  motion level.** This is the single most important inversion of Impeccable's
  artifact. Impeccable's memory is **lossy**: it tokenised one curve and *dropped*
  the 180ms-×56 duration the project actually uses — "the memory recorded 1 of
  roughly 16 real motion values" ([`06a`](06a-the-persisted-artifact.md) §3d; parent
  §2). A measured memory cannot afford that, because the measurement *is* the
  product. So each motion keeps its `easingLiteral`/`durationLiteral` **beside** the
  token ref (the legacy `lead.ease` + `lead.easeBezier` pair, both retained,
  `SPEC.md:170-176`). The token table is a convenience layer for the linter and for
  interop; rewriting a motion's `timing.easing` to a token name (§4) must never
  delete the literal it rolled up. Tokenisation is indexing, not compression.
- **`tokens` (value recurrence) and a future `patterns[]` (gesture recurrence) are
  different axes.** A token says "this *value* recurs" (650ms shows up in 4 motions).
  The legacy schema also had `patterns[]` — "group instances sharing a *mechanism* →
  recreation builds ONE utility" (`SPEC.md:157-162`): five work-cards doing the same
  hover are one *gesture* repeated, distinct from five motions that merely share a
  duration. `patterns[]` is the natural next grouping for collapsing N identical
  captures into one entry with an `appliesTo` list, and it is where stagger lives
  most honestly. Out of scope for v1 (the `tokens`/`motions` split already earns the
  artifact its keep), but flagged so the schema leaves room for it. **EXPLORE.**

---

## 4. How a `__cap.dump()` spec folds in, field by field

Folding is mechanical — no LLM, no authoring. One capture's `dump()` report
becomes zero-or-more `motions[]` entries plus token promotions:

| `motion.json` field | Source in `__cap.dump()` | Anchor |
|---|---|---|
| `motions[].trigger` | `report.meta.trigger` (engine enum: hover\|scroll\|load\|manual) | `capture-animation.js:1350`, `:27` |
| `motions[].mechanism` | `finding.leadProperty` (the salient mover, ∈ the 10 `PROPS`) | `:740`, `:37-40` |
| `motions[].selector` / `locator` | `finding.selector` / `finding.locator` | `:730-731` |
| `motions[].from` / `to` / `technique` | `finding.from` / `finding.to` / `finding.technique` | `:746-749` |
| `motions[].timing.{durationLiteral}` | `finding.timing.duration` (`cssTiming` else `measuredTiming`) | `:457`, `:665-668`, fallback `:688` |
| `motions[].timing.{easingLiteral}` | `finding.timing.easing` | `:457`, `:666-667` |
| `motions[].layers` / `stagger` | `findings.length` / `report.stagger` (nullable) | `:1340`, `:779,:814` |
| `motions[].confidence` | from the easing string: contains `verify` → `verify`, else `measured` | `:666-667` |
| `motions[].timelineRef` | written from `finding.timeline` / `rawFrames` to disk | `:739`, `:750` |
| `motions[].provenance.engine` | `report.meta.capturedFrom` | `:1347` |
| `tokens.easings[].aliases.gsap` | `report.evidence.gsap` source evidence | `:1343,1364` |
| `source.url` | `report.meta.source` | `:1346` |

The three steps where the fold does more than copy a field — and the only places
judgment enters:

1. **Region assignment (the one map-dependent step).** A `__cap` capture is
   *element*-scoped — `__cap.on(sel)` / `__cap.scan(root)` track DOM elements, and
   `finding.selector`/`locator` resolve elements, **not Regions**. But `motion.json`
   groups by `Region` (§3). So the fold must map a captured root selector to a Region
   id, and the only honest source is the Map's place-first `page-model.json` Region
   geometry (`docs/CONTRACT.md:106-108`): the captured element's live bounding box
   resolves into the Region whose geometry contains it. This is a lookup against
   measured geometry, not a guess — but it is the one step that fails if the Map was
   never run, which is why `region` must be allowed to be `null` (`"unknowns"`, §3)
   rather than invented.
2. **Tokenisation (lift recurring *values* to names).** After folding, compare the
   new motion's literal `timing` against the token table. If its easing is within
   tolerance of an existing easing token (§7's curve comparator), set
   `timing.easing` to that token's name, keep `easingLiteral` (never dropped, §3),
   and bump `observedIn`. If it recurs across motions but matches no token, mint one.
   If it is a one-off, leave the ref empty and the literal inline. Same "lift
   recurring values to names" move as the legacy schema (`SPEC.md:152-156`), run
   incrementally on every capture instead of once.
3. **Confidence carry-through (worst-of-layers).** `finding.timing.easing` already
   carries YoinkIt's honesty inline (`"unknown (rAF/JS) — verify"`, `:666-667`). The
   fold substring-reads that into the structured `confidence` field. A gesture's
   confidence is the **worst** of its layers' — one unreadable layer makes the whole
   motion `verify`, never silently `measured`. (The `(measured)` suffix on a
   `measuredTiming` *duration* with an `unknown` easing is the same honesty: duration
   was timed, easing was not.)

### Accumulation: the fold is an *upsert by `id`*, not an append

This is the part that distinguishes a memory from a log, and the draft schema's
`motions[]` array hides a real decision. Re-capturing `work-card-hover` next month
must **replace** the existing entry, not append a second one — otherwise the array
bloats with near-duplicates and `observedIn` (counted from `motions`, below) inflates
on every re-run. So the fold keys on the stable kebab-case `id` (the legacy
convention, `SPEC.md:165`):

- **New `id`** → insert the motion, run tokenisation, recompute coverage.
- **Existing `id`** → overwrite the measured fields (timing, from/to, layers,
  confidence, provenance) with the *fresh* capture, preserving only the
  human-authored fields a re-measure cannot reproduce — the `note`, the `register`,
  and any `importance`. Measurement is authoritative for mechanics; the human stays
  authoritative for intent. This split is exactly the contract's own rule: "Notes
  carry human intent, not mechanical facts the engine can measure"
  (`docs/CONTRACT.md:1096-1097`).
- **`observedIn` counts distinct `motions`, not capture events.** A token's
  `observedIn` is `motions.filter(m => referencesToken(m, token)).length`, recomputed
  after each upsert — so re-measuring the same motion is **idempotent** and the count
  means "how many *gestures* share this value," not "how many times we ran capture."
  A token that drops to `observedIn < 2` after an upsert demotes back to an inline
  literal; a token at `observedIn: 0` is deleted (it is the §9 contradiction).

Everything outside those three steps is a copy. The fold is a pure function
`(dump, motionJson) → motionJson'` with **no authoring branch** — which is exactly
why the object is *measured, not authored*: there is nowhere in it for a value to be
invented, only measured, indexed, and merged. That is the whole guarantee, and it is
worth a property test (a fold of any `__cap.dump()` must add zero tokens whose
`value` did not appear in the dump's `findings`).

---

## 5. Interop with Impeccable's `extensions.motion`, and the motion `narrative`

### Free interop, one direction

The survey's ADOPT claim — "a YoinkIt motion token could drop straight into an
Impeccable `extensions.motion` array" — holds, with a precise boundary. An
Impeccable motion token is `{name, value, purpose}`
([`06a`](06a-the-persisted-artifact.md) §3d). A `motion.json`
`tokens.easings[]` entry is `{name, value, purpose, confidence, observedIn,
aliases}`. Strip the measured extensions and it is byte-for-byte an
`extensions.motion` row:

```js
// YoinkIt measured token  →  Impeccable authored token (free, lossy)
const impeccableMotion = motionJson.tokens.easings
  .concat(motionJson.tokens.durations)
  .map(({ name, value, purpose }) => ({ name, value, purpose }));
// → drops straight into design.json.extensions.motion ([06a] §3d)
```

So a site yoinked with YoinkIt can **seed** an Impeccable design memory's motion
block with *measured* tokens — the one thing Impeccable's LLM generation path
([`06b`](06b-generation-and-migration.md)) cannot produce, because it invents
rather than measures. The reverse (Impeccable → YoinkIt) is also defined but
**must down-rank**: an authored `extensions.motion` token imports as
`confidence: "unknown"` (it was decided, not observed), never `measured`. Keeping
that asymmetry honest is the whole inversion in one rule. **ADOPT (the schema
seam).**

### The motion `narrative` (human-intent prose)

Impeccable pairs machine tokens with a `narrative` block so the file says *why*,
not just *what* ([`06a`](06a-the-persisted-artifact.md) §5). A raw frame timeline
has the identical gap: it says a layer scaled 1.1→1 over 650ms; it does not say
*that reveal is the entire point of the site* or *this 1200ms is signature, not a
bug*. YoinkIt already has the source for that prose, and it is **not** an LLM: the
`Note` — "Free-text human intent attached to a region or mark … For judgment the
engine cannot measure. Never for mechanics" (`CONTEXT.md:248-252`).

So `motion.json.narrative` is a structured home for Notes: a top-level
`signature` sentence and per-motion `notes[]` carrying the `importance` the human
assigned. The inversion vs Impeccable is exact and worth stating: Impeccable's
narrative is an **LLM authoring intent**; YoinkIt's is a **human judging measured
motion**. Same slot in the file, opposite origin. **EXPLORE** (the survey's tag;
it depends on the human Note loop, which YoinkIt's observe mode already has —
`docs/ARCHITECTURE.md:335-339`).

---

## 6. The motion `register` tag — on YoinkIt's own terms

The survey proposes tagging each capture `brand` or `product` — borrowing
Impeccable's register ([`06c`](06c-the-enforcement-reader.md) §5) — so the
recreating agent knows whether to **preserve** a measured duration or **normalise**
it. The instinct is right; the vocabulary should be YoinkIt's, not Impeccable's,
for two reasons:

1. **Granularity.** Impeccable's `brand`/`product` is a **whole-site** doctrine
   (`PRODUCT.md:5`; one value per project). The preserve-vs-normalise decision is
   **per-motion**: a brand site still has incidental hover states to normalise, and
   a product app still has one signature onboarding reveal to preserve. YoinkIt's
   native axis is already per-motion: `Signature` ("the part worth yoinking …
   distinct from incidental polish", `CONTEXT.md:19-22`) and the `importance`
   enum on Notes (`signature/useful/polish/ignore`, `CONTEXT.md:250-251`).
2. **Truth-source.** Impeccable's register conditions *authored* doctrine.
   YoinkIt's tag conditions how faithfully to reproduce a *measured* fact. That is
   the Signature judgment, not a brand/product judgment.

So the per-motion tag is:

```
register: "signature"   // load-bearing; reproduce the measured timing faithfully
register: "incidental"  // polish/feedback; the agent may normalise to convention
```

mapped from the human's `importance` (`signature` → `signature`; `polish`/`ignore`
→ `incidental`; `useful` → agent's call). A coarser optional `source.siteRegister:
"brand" | "product"` can carry the whole-site Impeccable-style hint for when no
per-motion judgment exists — that is the direct brand/product borrow, kept as the
fallback the field actually is ([`06c`](06c-the-enforcement-reader.md) §5: the
register field is the *third*-priority signal, not an override).

The register also gates the linter's tolerance (§7): a `signature` motion's timing
is enforced **tight** (drift means the recreation lost the point); an `incidental`
motion's is enforced **loose** (drift is fine, normalisation is allowed). This is
the exact shape of YoinkIt's existing build gate — "`measured` items gate tight,
`verify` items get loose tolerance" (`CONTEXT.md:140-145`) — now also keyed on
register. **EXPLORE.**

---

## 7. The motion-consistency linter — YoinkIt's `design-system.mjs`

The sharpest transferable mechanism. `design-system.mjs` reads the memory into an
allowed set and flags code that drifts off it within a tolerance
([`06c`](06c-the-enforcement-reader.md) §2-3). Invert it: read `motion.json` into
an allowed **motion vocabulary** and flag a **new capture or a recreation** whose
motion drifts off the site's established easing/duration language. A capture tool
becomes a motion-consistency linter.

### The three axes map onto Impeccable's three, exactly

`design-system.mjs` does not use one comparison strategy — it uses **three**, one
per axis, and the choice of strategy per axis is the design (verified in source this
session). Motion has three axes too, and they line up one-to-one:

| Impeccable axis | Strategy | Source | Motion axis | Same strategy |
|---|---|---|---|---|
| **font** | **exact set membership** — `allowedFonts.has(font)` after normalize, no tolerance | `isAllowedFont:390-394` | **trigger** | exact membership in `triggersSeen` — `hover`≠`scroll`, no "close" |
| **color** | **parsed-value tolerance** — `colorsClose` ≤ `COLOR_CHANNEL_TOLERANCE` (6) per channel | `colorsClose:194-201`, const `:10` | **easing** | sample both béziers, max vertical deviation ≤ `EASE_TOLERANCE` |
| **radius** | **px tolerance + escape band** — `±RADIUS_TOLERANCE_PX` (0.5), plus `hasPillRadius && px>=99 → allow` | `isAllowedRadiusRaw:410-419`, const `:11`, pill `:417` | **duration** | `±DURATION_TOLERANCE_MS` floor + proportional band, plus a spring/very-long escape |

The lesson to copy is **parse, don't string-compare** (the move `06c` §3 flags as the
heart of the file): `ease-out` and `cubic-bezier(0,0,0.58,1)` are the *same curve* and
must compare equal, exactly as `#fff` and `rgb(255,255,255)` do in `colorsClose`. A
motion linter that string-matches easing names is the bug `design-system.mjs` was
written to avoid.

### Auto-pass guards — the unglamorous half that makes the scan usable

A linter is only as good as what it *refuses* to flag, and `design-system.mjs` spends
real code on auto-passes before it ever consults the allow-set ([`06c`](06c-the-enforcement-reader.md)
§6's false-positive defense). Each has a direct motion analog the implementer must
build or the linter will cry wolf:

| Impeccable auto-pass (off-system check returns `true` early) | Source | Motion analog (don't flag) |
|---|---|---|
| `var(...)` references — already a token | `isAllowedColorRaw:402` | a motion whose `timing.easing` is a **token ref** (already in vocabulary) |
| generic font families (`serif`, `system-ui`) | `GENERIC_FONTS`, `isAllowedFont:391` | CSS-keyword easings (`linear`, `ease`) and the browser default — not "drift" |
| `transparent` / `currentColor` / `inherit` | `isAllowedColorRaw:399` | `trigger: load` boot motion when the memory has no load-trigger vocabulary yet |
| `0` / `none` radius, or `px <= 0.5` | `isAllowedRadiusRaw:413,416` | `0s` duration / no-transition (`cssTiming` returned `null`) — there is no motion to lint |
| pill escape: any `px >= 99` when a pill token exists | `isAllowedRadiusRaw:417` | a spring/bounce or >1200ms signature duration — a wide band, not a hard token |

Without these, the very first recreation lints red on `linear` fades and `0s`
resets — noise that trains the user to ignore the tool. The guards are not polish;
they are what `06c` §6 calls the difference between a usable scan and an unusable one.

### The reader (mirrors `loadDesignSystemForCwd:358`)

```js
function loadMotionMemoryForCwd(cwd) {
  const mem = safeReadJson(path.join(cwd, '.yoinkit', 'motion.json'));
  if (!mem) return null;                              // ABSENT → fail-open: no memory, no linting (06c §2)
  if (mem.schemaVersion !== SCHEMA_VERSION)           // PRESENT but unreadable → fail-VISIBLE, never
    return { present: true, error: 'schema-version', needsRecapture: true };  //   silent-empty (§10 decision 1)
  const out = {
    present: true,
    allowedEasings: mem.tokens.easings.map(t => ({ name: t.name, curve: sampleBezier(t.value), confidence: t.confidence })),
    allowedDurations: mem.tokens.durations.map(t => ({ name: t.name, ms: toMs(t.value), confidence: t.confidence })),
    allowedTriggers: new Set(mem.coverage.triggersSeen),
    hasEasings: mem.tokens.easings.length > 0,        // fail-open per axis (06c §2)
    hasDurations: mem.tokens.durations.length > 0,
    sourceChangedSinceCapture: mem.coverage.sourceChangedSinceCapture,
  };
  return out;
}
```

### The tolerance comparator (mirrors `colorsClose:194` / `isAllowedRadiusRaw:410`)

`design-system.mjs` compares colors within `COLOR_CHANNEL_TOLERANCE = 6` channels
and radii within `RADIUS_TOLERANCE_PX = 0.5` ([`06c`](06c-the-enforcement-reader.md)
§3). The motion analogs:

- **Easing:** sample both bezier curves at N points (e.g. 16) and take the max
  vertical deviation; allowed if `<= EASE_TOLERANCE` (a small ε on a 0..1 curve).
  This makes `ease-out` and `cubic-bezier(0,0,0.58,1)` compare **as curves**, not
  strings — the exact move `design-system.mjs` makes for colors (parse, don't
  string-compare). Spring/bounce families admit a wider band (the pill-radius
  escape hatch's analog, `isAllowedRadiusRaw:417`).
- **Duration:** allowed if within `max(DURATION_TOLERANCE_MS, ratio * tokenMs)` —
  an absolute floor plus a proportional band, since 20ms matters at 150ms and not
  at 1200ms.
- **Confidence- and register-weighting:** widen the tolerance for `verify`/`unknown`
  tokens and for `incidental` motions; tighten it for `measured` and `signature`.
  This is `CONTEXT.md:140-145`'s gate ("measured gate tight, verify loose")
  applied to the linter.

### The flag (mirrors `checkSourceDesignSystem:512` emitting `design-system-color`)

```js
function checkMotionVocabulary(finding, mem) {
  const out = [];
  if (mem.hasEasings && !nearAnyEasing(finding.timing.easing, mem)) {
    out.push(motionFinding('motion-off-easing', finding.selector,
      `Easing ${finding.timing.easing} is outside the site's measured motion vocabulary`,
      { ignoreValue: finding.timing.easing, nearest: nearestEasingToken(finding, mem) }));
  }
  if (mem.hasDurations && !nearAnyDuration(finding.timing.duration, mem)) {
    out.push(motionFinding('motion-off-duration', finding.selector,
      `Duration ${finding.timing.duration} is off the site's measured durations`,
      { ignoreValue: finding.timing.duration, nearest: nearestDurationToken(finding, mem) }));
  }
  return out;
}
```

Three rule ids — `motion-off-easing`, `motion-off-duration`, `motion-off-trigger`.
The two tolerance axes (`-easing`, `-duration`) each carry the **nearest token**, so
the message can say *which* established token it missed, exactly as
`design-system.mjs` labels a color `sidecar.kinpaku-gold.tonalRamp[4]`
([`06c`](06c-the-enforcement-reader.md) §2). `-trigger` is categorical (exact
membership, the font analog) so it carries no "nearest" — only "not in
`triggersSeen`," the same way a font is flagged as simply "not declared in
typography" (`checkFontStack:476-487`). All three carry an `ignoreValue` so the
suppression model ([`05c`](../05-hook-system/05c-config-and-ignore-model.md) §3) can
scope an intentional exception with a `reason` + `createdAt`.

### Two consumers

- **Capture-time:** flag a *new* capture whose motion is off the site's own
  vocabulary — either the recreation drifted, or the source site is genuinely
  inconsistent. Both are worth surfacing.
- **Recreation-time (a hook):** run on every edit to a recreation, surfacing
  "your hover at frame 12 used `ease-in-out`; the site's measured signature is
  `ease-signature` (expo-out)" — the precise [`05`](../05-hook-system/05-hook-system.md)
  hook pattern, now gating motion fidelity instead of design drift. Fail-open and
  never-break-the-turn ([`05a`](../05-hook-system/05a-hook-models-and-runtime-core.md))
  apply unchanged.

**The inversion at the mechanism's core.** `design-system.mjs` enforces an
**authored ideal** — "the code deviated from the colors a human decided were
good." The motion linter enforces a **measured norm** — "this animation deviated
from what the site empirically does." The truth-source flips from
normative-by-authorship to normative-by-observation. The allow-set is the same data
structure; what it *means* to be "off-system" inverts completely. **ADOPT (the
mechanism), with the truth-source inverted.**

---

## 8. The motion panel (the live merge, inverted)

For free, the same `/design-system.json` merge ([`06c`](06c-the-enforcement-reader.md)
§4) gives YoinkIt a motion panel: an endpoint returning
`{ present, memory (the measured motion.json), notes (human intent), hasMemory,
sourceChangedSinceCapture, memoryError? }`, so a panel can render captured
timelines beside the human Notes and a stale hint — the measured analog of
Impeccable rendering swatches beside rules. This is also the survey's Territory 3
"paste a URL, see the captured motion spec" lab, now backed by a durable artifact
rather than a one-shot capture. Noted as the **seam to Territory 3**, out of scope
here. **EXPLORE.**

---

## 9. The catch — what makes this measured, and what not to copy

The strongest angle is also the most fragile, because the failure mode is subtle:
a measured memory that quietly starts authoring. The guardrails, each a direct
inversion of an Impeccable mechanism:

- **No synthesize-on-thin for motion.** Impeccable's day-zero rule invents
  plausible default tokens so the panel always renders
  ([`06b`](06b-generation-and-migration.md) §4). `motion.json` must do the
  opposite: a thin memory **shows its thinness** via `coverage` (regions captured
  vs total) and an explicit `unknowns[]` list of what was *not* read — the legacy
  schema's `unspecced[]` (`SPEC.md` tail) and the contract's per-pass "unknowns as
  `null + reason`" (`docs/CONTRACT.md:1094`), both already YoinkIt habits. It renders
  blanks for un-captured regions — YoinkIt's Report posture ("blank regions are the
  parts not yet captured", `CONTEXT.md:96-110`). A token with `observedIn: 0` is a
  contradiction and must never be written; an honest gap is an `unknowns` entry, never
  a synthesized default.
- **No reserved-but-unused tokens.** The demo's `ease-card` ("currently unused but
  reserved", [`06a`](06a-the-persisted-artifact.md) §6) is the prescriptive habit
  — a vocabulary entry ahead of any code. A measured token exists only because a
  capture produced it.
- **Don't copy the LLM generation path.** `motion.json` is written by the fold
  (§4), a pure function of `__cap.dump()`. There is no `/yoinkit document` that
  asks a model to write a motion system. The survey's catch verbatim: "Do not copy
  the generation path (an LLM inventing tokens). The new object is a *measured*
  motion memory" (06 survey lines 182-186).
- **Confidence is load-bearing, not decoration.** Every token and motion carries
  `measured | verify | unknown`. The linter (§7) and any downstream build gate
  weight tolerance by it — "measured gate tight, verify loose" (`CONTEXT.md:140`).
  This is what keeps the artifact honest as it accumulates: an unreadable easing
  enters the memory as `verify`, never as a confident `measured` token.

Where the analogy simply breaks (and should): Impeccable's capture is free (read
computed styles off an overlay it already injected), so its memory can be
regenerated on a whim. YoinkIt's capture is the **hard part** — it needs a real,
visible browser to fire framework handlers (`CLAUDE.md`: "0 moved layers in
headless Chrome and 6 in a real, visible tab"; `docs/ARCHITECTURE.md:301-305`: "the
quality ceiling is set by capture quality"). So YoinkIt cannot cheaply
re-author/re-measure to migrate a schema ([`06b`](06b-generation-and-migration.md)
§3); the memory must **accumulate** captures over time and tolerate partial
coverage as the normal state, not a defect.

---

## 10. Open decisions the implementer still owns

The schema (§3), the fold (§4), and the linter (§7) are specified to the field. Five
decisions remain genuinely open — flagged here so a future agent inherits the
*questions*, not just the happy path, and so none of them gets answered silently by
accident.

1. **Versioning must fail *visible*, not *silent-empty* — this is a hard
   requirement, not a preference.** Impeccable migrates `v1→v2` by **regeneration**
   (re-author with the LLM); a `v1` file no reader migrates simply reads as **empty**,
   which is safe for an *authored* memory (regenerate on a whim, parent appendix; 06b
   §6). YoinkIt cannot regenerate — it must re-*measure*, which needs a real visible
   browser and the *live* site, which may have changed. So a silent-empty read is a
   trap: an empty allow-set makes the linter (§7) pass **everything**, reporting "no
   drift" on a memory it actually failed to load. A `motion.json` whose `schemaVersion`
   the reader doesn't understand must therefore **refuse to lint and surface "memory
   needs re-capture,"** never degrade to a no-op. The parent's "a YoinkIt reader must
   fail visible, not silent-empty" (appendix) is *this* decision.

2. **What generates the motion `id`, given source churn?** The upsert keys on a stable
   `id` (§4), but ids derived from CSS selectors orphan on a class rename: the
   re-capture mints a new id and the old entry strands with a stale `observedIn`.
   Candidate: derive the id from `region` + `mechanism` + `trigger` (survives class
   renames; collides if a region has two same-mechanism hovers) or let observe mode
   carry a human-confirmed id. The choice sets how gracefully the memory survives a
   site redesign — the exact scenario `motion.json` exists to handle.

3. **Region assignment when no Map was run.** §4 step 1 needs `page-model.json`
   geometry; a capture-only run has no Regions. Either require a Map before folding, or
   accept `region: null` motions a later Map run back-fills. The draft picks the latter
   (region is nullable, surfaced in `unknowns`) so capture is never blocked on mapping
   — but a memory full of `region: null` motions has lost the place-first spine, so the
   back-fill can't be optional forever.

4. **When does the fold write and commit?** The fold is pure either way (§4), but the
   *write* of `.yoinkit/motion.json` is a side effect with a git footprint. Per-pass
   writes give a noisy history of half-captures; per-run writes give one clean commit.
   Recommend **per-run** (after the run's passes merge into `page-model.json`),
   mirroring how Impeccable commits `design.json` once per `document` run, not per
   edit. The capture-time linter (§7, "two consumers") still reads the *previous*
   committed memory mid-run — it does not need the write to have happened yet.

5. **One motion across viewports: one entry or many?** `coverage.viewports` and the
   per-motion `viewport` field (§3) leave open whether a gesture measured at desktop
   *and* mobile is one motion with two timings or two motions. Primary-viewport-first
   (`CONTEXT.md:65-74`) argues for **desktop as the spine, mobile as a tagged
   overlay** on the same `id` — but that means `timing` becomes viewport-keyed, a
   schema change worth deciding before v1 ships rather than bolting on at v2 (which, by
   decision 1, YoinkIt cannot cheaply migrate into).

None of these block the artifact; all of them are cheaper to decide now than after the
first `motion.json` is committed and the "can't cheaply re-measure to migrate"
constraint (§9) has teeth.

---

## What this means for YoinkIt (tagged)

- **ADOPT — the durable artifact, as the missing per-*site* tier.** A committed,
  `schemaVersion`/`generatedAt`-stamped `.yoinkit/motion.json` with `tokens`
  (vocabulary) + `motions` (instances, grouped by Region) + `narrative` + `coverage`.
  It is not a new stage inside `yoink-runs/{…}/` — it is the tier *above* the entirely
  per-run pipeline, replacing N throwaway gitignored `*.animation.json` with one
  accumulating, diff-able, git-tracked memory that survives a run the way
  `.impeccable/design.json` survives a `detect`. *Ref: the placement §1; the schema
  §3; Impeccable's frame [`06a`](06a-the-persisted-artifact.md).*
- **ADOPT — the `{name,value,purpose}` interop seam.** Easing/duration tokens that
  are valid Impeccable `extensions.motion` rows, extended with measured fields, so a
  YoinkIt capture can seed an Impeccable motion block with *measured* tokens (one
  direction; the reverse imports as `confidence: unknown`). *Ref: §5;
  [`06a`](06a-the-persisted-artifact.md) §3d.*
- **ADOPT — the fold.** A pure function from `__cap.dump()` + existing memory to a
  new memory (§4). No authoring step exists in it; that is what makes the object
  measured. *Ref: `capture-animation.js:1344-1368`; the mapping table §4.*
- **ADOPT — the motion-consistency linter, truth-source inverted.** Read the memory
  into an allowed motion vocabulary; flag new captures/recreations off it within an
  easing/duration **tolerance**, weighted by confidence and register; emit
  `motion-off-easing`/`-duration` findings naming the nearest token. The mechanism
  is `design-system.mjs`; the meaning inverts from authored-ideal to measured-norm.
  *Ref: §7; [`06c`](06c-the-enforcement-reader.md) §2-3.*
- **EXPLORE — the motion `narrative`.** Pair measured tokens with human-intent prose
  sourced from Notes (not an LLM), so the memory says what is load-bearing. *Ref:
  §5; `CONTEXT.md:248-252`.*
- **EXPLORE — the per-motion `register` tag.** `signature`/`incidental`
  (preserve vs normalise), mapped from YoinkIt's `importance` enum, with an optional
  coarse `siteRegister` brand/product fallback. *Ref: §6; `CONTEXT.md:19-22,251`.*
- **EXPLORE — the motion panel + URL lab** (the Territory 3 seam). *Ref: §8.*
- **INSPIRATION — confidence as the spine, coverage shows thinness, the token is an
  index not a replacement, never synthesize.** The disciplines that keep an
  accumulating measured memory from decaying into an authored one — including keeping
  every measured literal beside its token ref so the memory stays *lossless* where
  Impeccable's was lossy (1 of ~16 values kept, parent §2). *Ref: §3, §9;
  `CONTEXT.md:140-145`, [`06b`](06b-generation-and-migration.md) §4.*
- **OWN — the five open decisions.** Versioning that fails visible (not
  silent-empty), `id` stability under source churn, region back-fill, when the fold
  writes, and one-motion-across-viewports. Decide them before v1 commits, because §9's
  "can't cheaply re-measure to migrate" makes a wrong default expensive. *Ref: §10.*
