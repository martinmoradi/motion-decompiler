# Design-memory deep dive 06b — generation, synthesize-on-thin, the v1→v2 migration, and the staleness signal

Companion to [`06-design-memory.md`](06-design-memory.md). That report is the
overview; [`06a`](06a-the-persisted-artifact.md) is the artifact's anatomy. This
one goes to the floor on **how the artifact comes into being and changes over
time**: the LLM-driven generation path, the day-zero synthesis rule, the
documented v1→v2 reshaping, what `schemaVersion` actually does (and does not) do
at read time, and the `mdNewerThanJson` staleness signal — which is **not** where
the survey filed it.

Sibling slices, so this one stays in its lane:
- the schema the generator writes *into* (full anatomy, the motion block in
  context) → [`06a`](06a-the-persisted-artifact.md)
- how the written artifact is *read back and enforced*, incl. where
  `mdNewerThanJson` is **computed** and **rendered** → [`06c`](06c-the-enforcement-reader.md)
- the YoinkIt payoff (a measured memory whose "generation" is capture, not
  authoring) → [`06d`](06d-a-motion-json-for-yoinkit.md)

Generation references are into [`../../source/skill/reference/document.md`](../../source/skill/reference/document.md)
(429 lines) unless the path says otherwise. Every line number was re-verified
against `source/` this session; where the [06 survey](../../06-UNEXPLORED-TERRITORY.md)
§"How it is generated, read, and migrated" was stale, the correction is inline
and flagged.

**The inversion, stated once and held:** every mechanism in this slice exists to
let an **LLM author** tokens — invent a plausible design system from a scan and
commit it. That is precisely the half YoinkIt must **not** copy (06 survey
lines 180-186; [`06d`](06d-a-motion-json-for-yoinkit.md) §6). What *does* transfer
is the surrounding **discipline** — versioning, day-zero defaults, staleness
tracking, never-silently-overwrite — wrapped around a different core: YoinkIt's
tokens come from `__cap` measurement, not from a model's imagination.

---

## 1. Generation is LLM-driven, and the sidecar is "extensions only"

`/impeccable document` does not parse a design system out of code; it has the
model **write** one. The command produces two files: `DESIGN.md` (prose +
frontmatter) and the `.impeccable/design.json` sidecar. The sidecar's job is
stated at the Step 4b heading and body:

```
### Step 4b: Write .impeccable/design.json sidecar (extensions only)
```
([`document.md:240`](../../source/skill/reference/document.md))

```
The frontmatter owns token primitives (colors, typography, rounded, spacing,
components). The sidecar at `.impeccable/design.json` carries **what Stitch's
schema can't hold**: tonal ramps per color, shadow/elevation tokens, motion
tokens, breakpoints, full component HTML/CSS snippets (the panel renders these
into a shadow DOM), and narrative (north star, rules, do's/don'ts). It extends
the frontmatter, it doesn't duplicate it.
```
([`document.md:242`](../../source/skill/reference/document.md))

The division of labor is explicit and is the reason the sidecar exists at all:
the `DESIGN.md` frontmatter is a fixed "Stitch" token schema (colors, typography,
rounded, spacing, components — 8 component sub-props), and **motion does not fit
it**:

```
- **Component sub-tokens** are limited to 8 props: `backgroundColor`, `textColor`,
  `typography`, `rounded`, `padding`, `size`, `height`, `width`. Shadows, motion,
  focus rings, backdrop-filter: none of those fit. Carry them in the sidecar
  (Step 4b).
```
([`document.md:47`](../../source/skill/reference/document.md))

and the prohibition is restated as a closing rule:

```
- Don't invent frontmatter token groups outside Stitch's schema (no `motion:`,
  `breakpoints:`, `shadows:` at the top level). ... Anything else belongs in the
  sidecar's `extensions`.
```
([`document.md:429`](../../source/skill/reference/document.md))

**So `motion` lives in the sidecar precisely because the structured frontmatter
schema has no room for it.** That is a useful mirror for YoinkIt: motion is the
thing that overflows a static-design schema, which is why Impeccable — a static
design tool — ends up carrying it as an extension, and why YoinkIt — a *motion*
tool — should treat motion as the spine, not an extension (06d §2).

### The generation *order* (correction: implied, not directed)

The survey says generation "writes `DESIGN.md` (prose), then writes the JSON
sidecar." **Directionally correct, but there is no single controlling sentence
that says "write the prose first, then the JSON."** The order is recoverable only
from structure:

- the prose is **Step 4** (`### Step 4: Write DESIGN.md`, [`document.md:125`](../../source/skill/reference/document.md))
  and the sidecar is **Step 4b** ([`document.md:240`](../../source/skill/reference/document.md));
- the sidecar's narrative fields are told to be pulled **from the prose just
  written**: "Pull directly from the DESIGN.md you just wrote:"
  ([`document.md:321`](../../source/skill/reference/document.md)), and the schema
  comment "2-3 paragraphs of the philosophy, pulled from DESIGN.md Overview
  section." ([`document.md:283`](../../source/skill/reference/document.md)).

If a YoinkIt design lift needs a verbatim "prose-first" directive to cite, it is
not in this file — the ordering is an emergent property of the step numbering and
the "DESIGN.md you just wrote" back-reference. Minor, but the report should not
claim a directive that isn't there.

### Never silently overwrite

One discipline transfers cleanly regardless of the inversion: the generator is
forbidden from clobbering an existing memory.

```
If a `DESIGN.md` already exists, **do not silently overwrite it**. Show the user
the existing file and {{ask_instruction}} whether to refresh, overwrite, or merge.
```
([`document.md:69`](../../source/skill/reference/document.md))

and the sidecar is regenerated *in lockstep* with the prose, or independently on
request:

```
Regenerate the sidecar whenever you regenerate root `DESIGN.md`. If the user only
asks to refresh the sidecar (e.g., from the live panel's stale-hint), preserve
`DESIGN.md` and write only `.impeccable/design.json`.
```
([`document.md:244`](../../source/skill/reference/document.md))

This is the artifact treated as an accruing project asset, not a disposable dump
— the exact posture YoinkIt's gitignored, per-run captures lack today (06d §1).

---

## 2. The motion schema as written, and "synthesize on day zero"

### What the generator is told to write for `motion`

The only place `document.md` pins the motion shape is the schema example:

```
"motion": [
  { "name": "ease-standard", "value": "cubic-bezier(0.4, 0, 0.2, 1)", "purpose": "Default easing for state transitions." }
],
```
([`document.md:264-266`](../../source/skill/reference/document.md))

`{ name, value, purpose }` — identical to the real artifact's shape
([`06a`](06a-the-persisted-artifact.md) §3d), and with **no `duration` field**
(confirming 06a §6: `duration` is demo-only). The siblings in the same schema use
the same spine — `shadows` is `{name, value, purpose}` (`document.md:261-263`),
`breakpoints` is `{name, value}` (`document.md:267-269`).

There is **essentially no authoring guidance** for motion beyond this one
example. The model is told to grep `--ease-` / `--duration-` CSS custom
properties during the scan ([`document.md:84`](../../source/skill/reference/document.md))
and to carry motion in the sidecar; it is not told how to choose or shape a motion
token. The vocabulary is whatever the model decides to lift or invent.

### Day-zero synthesis (correction: it does not name motion)

The survey's INSPIRATION bullet reads: "When a capture is thin, synthesise a
plausible default token so the artifact always has something to render
(`document.md:313`)." The cited line is correct, and the *principle* is real and
strong:

```
If the project has **no component library yet** (bare landing page, new project),
synthesize canonical primitives from the tokens using best-practice defaults
consistent with the DESIGN.md's rules. Every `.impeccable/design.json` has
*something* to render, even on day zero.
```
([`document.md:313`](../../source/skill/reference/document.md))

A second synthesis clause covers tonal ramps — synthesise in OKLCH when the
project has no scale:

```
For each color token, generate an 8-step `tonalRamp` array: dark to light, same
hue and chroma ... If the project already defines a tonal scale ... use those
values. Otherwise synthesize in OKLCH.
```
([`document.md:317`](../../source/skill/reference/document.md))

**But "synthesize on thin" is about component primitives and tonal ramps, not
motion.** Re-verified this session: nothing in `document.md` instructs the model
to synthesize a motion token when motion is absent. The only motion default that
ships is the hardcoded `ease-standard` example in the schema block
([`document.md:265`](../../source/skill/reference/document.md)) — i.e. the model
will tend to emit *that* curve by default because the example shows it, not
because a rule says "invent motion when you find none." So the survey's
"synthesise a plausible default *token*" generalises a colors/components rule onto
motion; the support for motion specifically is the example, not a directive. (For
YoinkIt this distinction is the whole ballgame — see the catch, §5 and
[`06d`](06d-a-motion-json-for-yoinkit.md) §6: a *measured* memory must **never**
synthesize a motion it did not observe.)

### Seed mode: a deliberately partial memory, committed to a re-run

The strongest persistence-discipline move is seed mode: when the project is
pre-implementation, write a minimal memory and *commit to enriching it later*:

```
- **Seed mode**: the project is pre-implementation ... Interview for five
  high-level answers, write a minimal DESIGN.md marked `<!-- SEED -->`. Re-run in
  scan mode once there's code.
```
([`document.md:74`](../../source/skill/reference/document.md))

```
Seed mode writes a minimal frontmatter with `name` and `description` only ... Skip
the `.impeccable/design.json` sidecar in seed mode for the same reason: nothing to
render.
```
([`document.md:396`](../../source/skill/reference/document.md))

So on day zero the sidecar may not exist at all; it lands on the first scan-mode
run once there is code to read. This is "the difference between a one-shot tool
and persistent project memory" the survey points at — the artifact is explicitly
designed to be *regenerated as the project matures*. The YoinkIt analog is clean
and honest: a site captured once has a thin `motion.json`; capturing more
regions/triggers/viewports enriches it, and the memory tracks how complete it is
(06d §3, the `confidence` and coverage fields).

---

## 3. The v1→v2 migration, and what `schemaVersion` really does

### The documented reshaping

The migration is a single paragraph, and the survey did not cite its line. The
correct anchor is [`document.md:292`](../../source/skill/reference/document.md):

```
**What changed from schemaVersion 1.** The old sidecar carried token primitive
arrays (`tokens.colors[]`, `tokens.typography[]`, etc.). Those values now live in
the frontmatter. The sidecar only carries metadata that can't live in the
frontmatter (tonal ramps, canonical OKLCH when the hex is an approximation,
display names, role hints), keyed by the frontmatter token name
(`colorMeta.<token-name>`, `typographyMeta.<token-name>`). Components still carry
full HTML/CSS because Stitch's 8-prop set can't hold them.
```

This is exactly the reshaping the survey describes: token primitive **arrays**
(`tokens.colors[]`) moved out of the sidecar into the Markdown frontmatter, and
the sidecar reduced to **keyed metadata** (`colorMeta.<token-name>`). It is the
clearest evidence in the repo that this is a *versioned* artifact that gets
*migrated*, not a disposable parse — and it is the concrete answer to "what a
schema you can evolve without breaking old files looks like."

### Correction: readers do NOT branch on `schemaVersion`

The survey says "readers branch on `schemaVersion`." **Re-verified against
`source/`: no reader branches on it.**

- `schemaVersion` is written as a literal `2` in the generator
  ([`document.md:250`](../../source/skill/reference/document.md)) and named once
  retrospectively in the migration note (`:292`). `document.md` gives **no**
  "if schemaVersion === 1 do X else Y" reader guidance.
- The enforcement reader `cli/engine/design-system.mjs` contains **zero**
  references to `schemaVersion` (grep clean this session). It reads
  `sidecar.extensions.colorMeta` / `roundedMeta` directly
  ([`design-system.mjs:261,305`](../../source/cli/engine/design-system.mjs); 06c
  §2).
- The live server mentions it **only in a comment** — "Expected shape:
  schemaVersion 2, carrying extensions + components + narrative"
  ([`live-server.mjs:545`](../../source/skill/scripts/live-server.mjs)) — and then
  reads the sidecar raw with no version check (06c §3).

The practical consequence is sharper than "evolve without breaking old files": a
**v1 file does not break, it silently reads as empty.** The reader looks for
`extensions.colorMeta`; a v1 file that stored `tokens.colors[]` has no
`extensions.colorMeta`, so `addSidecarColors` finds nothing and contributes zero
allowed colors ([`design-system.mjs:261-262`](../../source/cli/engine/design-system.mjs)).
No error, no migration, no enforcement — the memory just goes quiet. So the
"migratable schema" is migratable by **regeneration** (re-run `/impeccable
document`, which writes a fresh v2), not by reader-side version dispatch. That is
a real and load-bearing correction: the durability comes from *re-authoring*, and
because YoinkIt cannot re-author (it must re-*measure*), YoinkIt's migration story
has to be different — a reader that tolerates and up-converts old shapes, or a
re-capture (06d §7).

---

## 4. The `mdNewerThanJson` staleness signal (correction: it lives in the readers)

The survey lists, under generation/migration: "a `mdNewerThanJson` signal
surfaces staleness." The signal is **real and correctly named**, but it is **not
defined in `document.md`** and it is not part of the generation spec. Re-verified
this session with a repo-wide grep:

- **`document.md` has no `mdNewerThanJson`.** It references only the *downstream
  concept* — "the live panel's stale-hint" ([`document.md:244`](../../source/skill/reference/document.md))
  and "An existing `DESIGN.md` is stale" ([`document.md:66`](../../source/skill/reference/document.md)).
- The signal is **computed by the readers**, by comparing file mtimes, in two
  independent places:

```js
mdNewerThanJson: !!(mdStat && sidecarStat && mdStat.mtimeMs > sidecarStat.mtimeMs + 1000),
```
([`cli/engine/design-system.mjs:386`](../../source/cli/engine/design-system.mjs),
inside `loadDesignSystemForCwd`)

```js
mdNewerThanJson: !!(mdStat && jsonStat && mdStat.mtimeMs > jsonStat.mtimeMs + 1000),
```
([`skill/scripts/live-server.mjs:574`](../../source/skill/scripts/live-server.mjs),
inside the `/design-system.json` handler)

- It is **carried** on the normalized design-system object
  ([`design-system.mjs:339`](../../source/cli/engine/design-system.mjs):
  `mdNewerThanJson: input.mdNewerThanJson === true`), **consumed** by the hook
  ([`hook-lib.mjs:1237`](../../source/skill/scripts/hook-lib.mjs):
  `if (!text || !scanOptions?.designSystem?.mdNewerThanJson) return text;`), and
  **rendered** by the live panel as a visible stale hint
  ([`live-browser.js:10474`](../../source/skill/scripts/live-browser.js):
  `if (designState.mdNewerThanJson) body.appendChild(renderStaleHint());`).

So the mechanism, end to end: **`DESIGN.md` modified more than 1 second after
`design.json`** ⟹ the memory (JSON) lags the source (MD) ⟹ readers flag it ⟹ the
hook appends a stale hint and the live panel shows a "refresh the sidecar" prompt
⟹ the user re-runs `/impeccable document` to regenerate the sidecar
([`document.md:244`](../../source/skill/reference/document.md)). The signal is a
**reader-side mtime heuristic**, not a generation-time field. Filing it under
"generation/migration" (as the survey does) misplaces it; it belongs to the
enforcement/consumption path (06c), and 06b's only claim on it is that it closes
the regeneration loop the generation discipline opens.

(One more discipline that pairs with staleness: after a regeneration *within a
session*, the just-written file is authoritative — "Your own write is the freshest
source; subsequent commands in this session don't need a reload."
[`document.md:337`](../../source/skill/reference/document.md), restated `:403`. The
mtime heuristic is for *cross-session* drift, not intra-session.)

---

## 5. The catch, restated for the generation path

Everything above is the machinery of **authoring**. The day-zero `ease-standard`
default, the model lifting `--ease-` custom properties, the reserved-but-unused
`ease-card` token in the demo ([`06a`](06a-the-persisted-artifact.md) §6) — these
are all ways an LLM **invents or asserts** motion the project may not actually
exhibit. That is the half to leave behind.

YoinkIt's "generation" is `__cap.dump()`: a per-frame measurement of what a page
*actually does* (06d §3). The disciplines wrapped around Impeccable's generator
transfer; the generator's core does not:

| Impeccable generation discipline | Transfers? | YoinkIt form |
|---|---|---|
| `schemaVersion` + `generatedAt` stamp | **yes** | stamp every `motion.json` write (06d §1) |
| Never silently overwrite; refresh/merge | **yes** | accumulate captures, never clobber (06d §1) |
| Regenerate in lockstep; track staleness | **yes (reframed)** | re-capture when source changes; a `sourceChangedSinceCapture` mtime/hash hint (06d §7) |
| Seed mode = a thin memory + commit to re-run | **yes** | a thin `motion.json` from one capture, enriched by more (06d §3) |
| Day-zero **synthesis** of plausible tokens | **NO** | a measured memory renders only what was observed; thinness is shown, never faked (06d §6) |
| LLM **authors** the token values | **NO** | `__cap` measures them (06d §3) |

The line is bright: copy the **envelope and the lifecycle**, never the **invention
of values**. A measured `motion.json` that synthesized a "plausible default
easing" because a capture was thin would be lying about the source — the one thing
YoinkIt's `confidence: measured` contract exists to prevent (CONTEXT.md; 06d §6).

---

## What this means for YoinkIt

- **ADOPT the lifecycle, not the generator.** Stamp `schemaVersion` +
  `generatedAt`, never silently overwrite, regenerate-on-change, and ship a thin
  memory that commits to later enrichment. All of this is sound and inversion-safe.
  *Ref: `document.md:69,74,244,250`.*
- **ADOPT staleness as a reader-side mtime/hash heuristic — and put it where
  Impeccable actually put it.** Compute a `sourceChangedSinceCapture` flag by
  comparing the captured source's mtime/content-hash to the memory's
  `generatedAt`, carry it on the loaded object, and surface it in any UI/agent
  context — exactly as `mdNewerThanJson` is computed in the readers
  ([`design-system.mjs:386`](../../source/cli/engine/design-system.mjs),
  [`live-server.mjs:574`](../../source/skill/scripts/live-server.mjs)) and rendered
  in the panel, **not** asserted in a generation spec. *Ref: §4.*
- **EXPLORE a migratable schema that tolerates old shapes by up-conversion, not by
  silent emptiness.** Impeccable's v1 files read as empty because nobody branches
  on `schemaVersion` (§3). YoinkIt cannot re-author to migrate, so a `motion.json`
  reader should either up-convert known old shapes or loudly flag an unreadable
  version — failing *open and visible*, not *silent and empty*. *Ref: §3; the
  no-branch reader, 06c §2.*
- **AVOID synthesize-on-thin for motion.** This is the one generation move to drop
  outright. A measured memory shows its gaps (a region with no capture is blank,
  CONTEXT.md's Report posture) and never invents a default curve to "have something
  to render." *Ref: §2 correction; the catch, §5; 06d §6.*
