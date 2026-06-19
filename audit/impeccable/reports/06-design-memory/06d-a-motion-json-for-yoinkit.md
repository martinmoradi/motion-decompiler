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
    sampledProperties: [...PROPS],      // the 10 props, :38-39
    sampledPseudoElements: [...PSEUDO_ELEMENTS],
    rootSelector, rootLocator,
    durationMs: captureDuration(),
    elementsMoved: findings.length,
    instrumentation: { gsap, customEase },
  },
  evidence,                             // { gsap: {...} }  source-level GSAP/CustomEase evidence
  summary: summarize(findings, stagger),// plain-English, :827
  stagger,                              // { items, staggerMs, ... } or 0   :778
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

Two properties of this output that the memory must preserve faithfully:

- **It is honest about what it could not read.** When easing is unreadable
  (rAF/JS-driven), `measuredTiming` (`:665-668`) emits
  `{ duration: "0.65s (measured)", easing: "unknown (rAF/JS) — verify" }` — the
  verify marker is **inline in the value**. That is YoinkIt's `confidence` made
  concrete at the property level, and `motion.json` lifts it to a structured
  `confidence` field rather than a magic string (§3).
- **It samples a fixed property set.** `PROPS` (`:38-39`) is
  `transform, opacity, filter, clipPath, backgroundSize, backgroundPosition,
  backgroundColor, color, height, width` — 10 properties. A motion token's
  `mechanism`/`leadProperty` is drawn from this closed set, which makes it a clean
  enum for the linter (§7).

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
      "timing": { "duration": "dur-reveal", "easing": "ease-signature" },  // token refs, not literals
      "from": { "scale": 1.1 }, "to": { "scale": 1 },              // from finding.from / finding.to
      "technique": "scale 1.1->1",                   // from finding.technique
      "layers": 6,                                   // from findings.length within the gesture
      "stagger": { "items": 5, "staggerMs": 125 },   // from dump.stagger (or null)
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

  // ── what the memory does and does not yet know — thinness is shown, never faked (§6).
  "coverage": {
    "regionsCaptured": 3,
    "regionsTotal": 7,                               // from the Map's place-first page model
    "viewports": ["desktop"],
    "triggersSeen": ["hover", "scroll"],
    "sourceChangedSinceCapture": false               // mtime/hash heuristic vs generatedAt (06b §7)
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

---

## 4. How a `__cap.dump()` spec folds in, field by field

Folding is mechanical — no LLM, no authoring. One capture's `dump()` report
becomes zero-or-more `motions[]` entries plus token promotions:

| `motion.json` field | Source in `__cap.dump()` | Anchor |
|---|---|---|
| `motions[].trigger` | `report.meta.trigger` | `capture-animation.js:1350` |
| `motions[].mechanism` | `finding.leadProperty` (∈ the 10 `PROPS`) | `:740`, `:38-39` |
| `motions[].selector` / `locator` | `finding.selector` / `finding.locator` | `:730-731` |
| `motions[].from` / `to` / `technique` | `finding.from` / `finding.to` / `finding.technique` | `:746-749` |
| `motions[].timing.duration` (literal, pre-token) | `finding.timing.duration` (`cssTiming` or `measuredTiming`) | `:457`, `:665-668` |
| `motions[].timing.easing` (literal, pre-token) | `finding.timing.easing` | `:457`, `:666-667` |
| `motions[].layers` / `stagger` | `findings.length` / `report.stagger` | `:1340-1341`, `:778` |
| `motions[].confidence` | derived from the easing string: `"… verify"` → `verify`, else `measured` | `:666-667` |
| `motions[].timelineRef` | written from `finding.timeline` / `rawFrames` to disk | `:739`, `:750` |
| `motions[].provenance.engine` | `report.meta.capturedFrom` | `:1347` |
| `tokens.easings[].aliases.gsap` | `report.evidence.gsap` source evidence | `:1343,1364` |
| `source.url` | `report.meta.source` | `:1346` |

The two non-mechanical steps — the only judgment in the fold:

1. **Tokenisation.** After folding, scan the new motion's literal `timing` against
   the existing token table. If its easing is within tolerance of an existing
   easing token (§7's comparator), rewrite `timing.easing` to that token's name and
   bump `observedIn`. If it recurs but matches no token, mint a new token. If it is
   a one-off, leave the literal inline. This is the same "lift recurring values to
   names" move, run incrementally on every capture.
2. **Confidence carry-through.** `finding.timing.easing` already carries
   YoinkIt's honesty inline (`"unknown (rAF/JS) — verify"`, `:666-667`). The fold
   reads that string into the structured `confidence` field. A motion's confidence
   is the **worst** of its layers' — one unreadable layer makes the gesture
   `verify`, never silently `measured`.

Everything else is a copy. The fold is a pure function from `__cap.dump()` +
existing `motion.json` to a new `motion.json` — which is exactly why it is
**measured, not authored**: there is nowhere in the fold for a value to be
invented.

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

### The reader (mirrors `loadDesignSystemForCwd:358`)

```js
function loadMotionMemoryForCwd(cwd) {
  const mem = safeReadJson(path.join(cwd, '.yoinkit', 'motion.json'));
  if (!mem) return null;
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

Three rule ids — `motion-off-easing`, `motion-off-duration`, `motion-off-trigger`
— each carrying the nearest token (so the message can say *which* established
token it missed, exactly as `design-system.mjs` labels a color
`sidecar.kinpaku-gold.tonalRamp[4]`, [`06c`](06c-the-enforcement-reader.md) §2),
and an `ignoreValue` so the suppression model
([`05c`](../05-hook-system/05c-config-and-ignore-model.md) §3) can scope an
intentional exception with a `reason` + `createdAt`.

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
  vs total) and renders blanks for un-captured regions — YoinkIt's Report posture
  ("blank regions are the parts not yet captured", `CONTEXT.md:96-110`). A token
  with `observedIn: 0` is a contradiction and must never be written.
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

## What this means for YoinkIt (tagged)

- **ADOPT — the durable artifact.** A committed, `schemaVersion`/`generatedAt`-stamped
  `.yoinkit/motion.json` with `tokens` (vocabulary) + `motions` (instances, grouped
  by Region) + `narrative` + `coverage`. It replaces N throwaway `*.animation.json`
  files with one accumulating, diff-able, git-tracked memory. *Ref: the schema §3;
  the gap §1; Impeccable's frame [`06a`](06a-the-persisted-artifact.md).*
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
- **INSPIRATION — confidence as the spine, coverage shows thinness, never
  synthesize.** The disciplines that keep an accumulating measured memory from
  decaying into an authored one. *Ref: §9; `CONTEXT.md:140-145`,
  [`06b`](06b-generation-and-migration.md) §4.*
