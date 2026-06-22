# Impeccable Persisted Design-Memory → a Measured Motion Memory for YoinkIt — Deep Technical Audit

**Subsystem:** Impeccable's **persisted design-memory** — the durable,
git-tracked, `schemaVersion`-stamped `.impeccable/design.json` captured from a
project and committed into its repo (the *sidecar half* of a Stitch-standard root
`DESIGN.md` pair; 06a §1). Its `extensions.motion` block (read in the
context of its `colorMeta` / `typographyMeta` / `shadows` / `breakpoints` /
`roundedMeta` siblings), the LLM **generation** path that writes it
(`/impeccable document`), the documented **v1→v2 migration** and the
`mdNewerThanJson` staleness signal, the **enforcement reader**
(`cli/engine/design-system.mjs`) that folds it into an allowed set and flags
off-system drift, the live-panel **merge** that returns it beside the parsed
prose, and the one-field **Register** taxonomy that flips its motion doctrine.

**Audience:** the YoinkIt team. YoinkIt captures what a web animation *actually
does* (per-frame computed-style sampling) and emits a **measured spec, not code** —
but it emits it as a **throwaway, gitignored, per-run** artifact
(`*.animation.json`, `yoink-runs/{host}/{date}-{slug}/`) with **no cross-run, per-
site memory**. Impeccable — a *static design* tool — has already built and shipped
the durable, versioned, accumulating, enforceable motion-carrying artifact that
YoinkIt — a *motion* tool — structurally lacks. This report goes to the floor on
that artifact and ends with a concrete, implementable **`motion.json`** proposal:
the *measured* counterpart to Impeccable's *authored* memory.

**Hold the inversion the whole way** (see [`00-EXECUTIVE-SUMMARY.md`](../../00-EXECUTIVE-SUMMARY.md)
and the [06 survey](../../06-UNEXPLORED-TERRITORY.md) lines 180-186): Impeccable's
design memory is **prescriptive and authored** — an LLM writes down the design a
project *should* follow, and the reader enforces code against that authored ideal.
YoinkIt's motion memory must be **measured and observed** — the `__cap` engine
writes down what a site *actually does*, frame by frame, and a linter would check a
new animation against the site's own empirical vocabulary. Same shape (a committed,
versioned, enforced token file), opposite physics (authored ideal vs measured
norm). The thing to **not** copy is the generation path — an LLM inventing tokens.
The new object exists in neither tool today, which is exactly why it is the
strongest angle.

All paths are under `../../source/` unless noted; YoinkIt paths are under the repo
root.

> **Deep dives.** This document is the overview. Four companions go to the floor on
> the parts a fresh agent would rebuild into YoinkIt, re-verifying every line number
> against `source/` (corrections flagged inline and collected below):
>
> - [`06a-the-persisted-artifact.md`](06a-the-persisted-artifact.md): the full
>   `design.json` schema anatomy — the motion block read in the context of its five
>   sibling extension blocks, `components`, and `narrative` — the `DESIGN.md` *pairing*
>   (the sidecar is "what Stitch's schema rejects," motion among the exiles), the
>   three-layer derivation, the **lossy motion projection** (the memory kept 1 of ~16
>   real motion values), the three-file git-tracked `.impeccable/` directory,
>   versioning, and the real-≠-demo-≠-spec-≠-fixture schema looseness.
> - [`06b-generation-and-migration.md`](06b-generation-and-migration.md):
>   generation is a **prompt, not a program** — `/impeccable document` is 429 lines
>   of English an LLM follows with its `Write` tool; **no code writes the sidecar**
>   (the only nearby code, `design-parser.mjs`, *reads* the prose back). The full
>   init→scan/seed→write pipeline, the component translation rules that are the
>   *only* place generation reliably emits motion (denormalized, as literal CSS),
>   the day-zero synthesis rule (which never names motion), the seed-mode **Motion
>   energy** question (motion is generation *input*, never *output*), the v1→v2
>   reshaping, why `schemaVersion` is a scattered naming convention no reader
>   dispatches on, where `mdNewerThanJson` really lives (the readers), and how you
>   verify a prompt-generator (run real LLMs, assert on the trace).
> - [`06c-the-enforcement-reader.md`](06c-the-enforcement-reader.md):
>   `design-system.mjs` traced end to end — the loader (DESIGN.md mandatory, sidecar
>   optional), allowed-set construction from **both halves** (frontmatter + every
>   `canonical`/`tonalRamp` stop), **tolerance** drift-flagging
>   (`COLOR_CHANNEL_TOLERANCE`, `RADIUS_TOLERANCE_PX`) with the fail-open ladder, the
>   **two front-ends** (raw-text scan + computed-style DOM walk) and **two dedup
>   layers**, the heavy false-positive defense that makes the scan usable, the
>   live-server merge, and the Register one-field conditioner.
> - [`06d-a-motion-json-for-yoinkit.md`](06d-a-motion-json-for-yoinkit.md): **the
>   payoff.** A literal, written-out `.yoinkit/motion.json` schema; how a
>   `__cap.dump()` spec folds in field by field; how multiple captures accumulate;
>   the free interop with `extensions.motion`; the motion `narrative` (human Notes);
>   the per-motion `register` tag (on YoinkIt's own `signature`/`importance` terms);
>   and the motion-consistency linter — `design-system.mjs` with its truth-source
>   inverted.
>
> **First-draft corrections (re-verified against `source/`).** The [06 survey](../../06-UNEXPLORED-TERRITORY.md)
> §"Territory 1" was directionally right and its load-bearing quotes (the
> `motion` block, the register doctrines) are accurate to the line. The stale or
> imprecise specifics, each fixed in a sub-dive:
>
> - **`.impeccable/` is a three-file directory, *and* `design.json` is only half the
>   memory.** `git ls-files .impeccable/` returns `config.json`, `design.json`, **and**
>   `live/config.json` — a multi-concern committed store. More importantly,
>   `design.json` is the *sidecar* to a Stitch-standard root `DESIGN.md` (`DESIGN.md`
>   is 497 lines, not even in `.impeccable/`). The sidecar is **defined by negation** —
>   it holds exactly what Stitch's Zod frontmatter schema rejects (`document.md:429`:
>   "only accepts `colors`, `typography`, `rounded`, `spacing`, `components`"), and
>   **motion is one of the rejects** (`document.md:47`). Motion is thin because it is a
>   guest in a static-token format, not because Impeccable was careless. (06a §1)
> - **The sidecar is *extracted and rolled up*, not "synthesised."** The survey calls
>   the values "synthesised in OKLCH." For the real artifact that is wrong: the
>   frontmatter mirrors `site/styles/kinpaku-tokens.css` verbatim (`DESIGN.md:5-7`), and
>   the sidecar's 9 `colorMeta` families are a *semantic rollup* of the frontmatter's
>   ~60 flat tokens — each `tonalRamp` is gathered real stops, which is why ramp length
>   varies 3→25 instead of the spec's synthesised "8-step." Synthesis is the day-zero
>   fallback, not what happened here. (06a §2c, §3a)
> - **Generation is a prompt, not a program — and `design-parser.mjs` is a *reader*,
>   not "the writer."** No code in the repo writes `.impeccable/design.json`; every
>   `design.json` reference in `skill/`/`cli/` is a reader or a path helper (grep
>   clean this session). The sidecar is hand-written by the LLM following
>   `document.md`. The nearby `design-parser.mjs` parses a *written* `DESIGN.md` back
>   into a render model, and its `schemaVersion: 2` (`:830`) is stamped on **that
>   model**, a different object than the sidecar. Earlier drafts (06a §6a) calling it
>   "the writer" are imprecise; corrected here and in 06b §1. (06b §1)
> - **`mdNewerThanJson` is a reader-side mtime heuristic, not a `document.md` /
>   generation field.** The survey files it under generation/migration. It does not
>   exist in `document.md`; it is computed by comparing mtimes in
>   `design-system.mjs:386` and `live-server.mjs:574`, consumed by `hook-lib.mjs:1237`,
>   and rendered by `live-browser.js:10474`. `document.md:244` references only the
>   downstream "stale-hint". It does, however, *trigger* generation (re-run
>   `document`), so it belongs to the lifecycle. (06b §7, 06c §4)
> - **No reader branches on `schemaVersion` — it is a scattered naming convention.**
>   The survey says "readers branch on `schemaVersion`." `design-system.mjs` has zero
>   references to it; `live-server.mjs:545` mentions it only in a comment. Worse, the
>   field name is reused on **≥4 unrelated artifacts** (the sidecar `:2` LLM-written,
>   the parsed-prose model `:2` code-written, the live-apply event `:1`, the apply
>   transaction `version:1`, the fixture renamed `version:2`), none reconciled. A v1
>   file is not migrated at read time — it silently reads as **empty**. Durability
>   comes from *regeneration*, not version dispatch. (06b §6)
> - **`motion[].duration` is demo-only.** The survey's "lived schema is `{name,
>   value, duration?, purpose}`" is accurate only as a *union*. `duration` appears in
>   exactly one of three instances — the worked-example demo
>   (`DESIGN.json:155-168`). The real committed artifact (`design.json:226-232`) and
>   the `document.md` schema (`:264-266`) both ship `{name, value, purpose}` with no
>   duration; the curve is tokenised, the duration lives inline in component CSS. The
>   demo's *two* motion tokens both carry `duration` but use the trivial `value:
>   "ease"`, and one is reserved-but-unused — authored ahead of code. (06a §3d, §6; 06b §4e)
> - **Synthesize-on-thin does not name motion.** The survey generalises "synthesise
>   a plausible default token (`document.md:313`)" onto motion. `:313` is about
>   component primitives, `:317` about tonal ramps; no directive synthesizes motion.
>   The only motion default is the `ease-standard` example at `:265`. The one place
>   generation *asks* about motion (seed-mode "Motion energy", `:368`) feeds the
>   answer into Overview voice and Elevation and emits **no motion token** — motion
>   is generation input, never output. A *measured* memory must never synthesize
>   motion — the catch. (06b §4, 06d §9)
> - **The four "same-schema" instances disagree** (real, demo, `document.md` spec, and
>   a sveltekit test fixture). colorMeta `description` and `roundedMeta` are present in
>   the real artifact but **absent** from the demo; `shadows` is 4 tokens in the real
>   artifact and empty `[]` in the demo; the fixture even renames the top-level keys
>   (`version`/`source` instead of `schemaVersion`/`title`). The schema is a bag of
>   optional blocks validated by tolerance, not a strict contract. (06a §3a, §6)
> - **The `Register` field is the third-priority signal, not an override.** Per
>   `source/CLAUDE.md`, Setup selects on **task cue → surface in focus → the
>   `register` field** (first match wins). The demo's value is `brand`
>   (`PRODUCT.md:5`, heading `:3`). The motion bullets are `product.md:40-42`
>   (durations `150–250 ms`, en-dash) and `brand.md:88` + `:105`; the survey's
>   `:38-42`/`:86-88` are heading-inclusive spans. (06c §5)

---

## File map

Click-through index (relative to `source/` unless marked **YoinkIt**). Line counts
re-verified this session.

| File | Lines | Role |
|---|---|---|
| **The design memory is a two-file pair** | | |
| [`DESIGN.md`](../../source/DESIGN.md) (repo root) | 497 | **The senior half.** Stitch-standard frontmatter (normative token primitives: `colors{}` ~60 flat, `typography{}`, `rounded`, `spacing`, `components`) + 6 prose sections. The reader's allowed *fonts* come from here. (06a §1) |
| [`site/styles/kinpaku-tokens.css`](../../source/site/styles/kinpaku-tokens.css) + [`tokens.css`](../../source/site/styles/tokens.css) | — | The actual source of truth the frontmatter "mirrors verbatim" (`DESIGN.md:5-7`); home of `--ks-ease`, `--ease-out`, the `--duration-*` ladder. (06a §2c, §3d) |
| **The committed `.impeccable/` directory** | | |
| [`.impeccable/design.json`](../../source/.impeccable/design.json) | 419 | **The sidecar half / design memory.** "Extensions only": `schemaVersion 2`, `extensions` (6 token blocks incl. `motion`), `components`, `narrative`. The reader's allowed *colors* + *radii* come from here. (06a) |
| [`.impeccable/config.json`](../../source/.impeccable/config.json) | 84 | The detector/hook ignore model — not design memory. ([`05c`](../05-hook-system/05c-config-and-ignore-model.md)) |
| [`.impeccable/live/config.json`](../../source/.impeccable/live/config.json) | 6 | Live-mode injection config. (06a §1) |
| **Generation + migration** | | |
| [`skill/reference/document.md`](../../source/skill/reference/document.md) | 429 | **The generator — a prompt, not a program.** The LLM follows it to write prose then the "extensions only" sidecar: 7-source scan, auto-extract, qualitative interview, component translation rules, synthesize-on-thin, seed mode (Motion-energy `:368`), v1→v2 migration note. (06b §1-6) |
| [`skill/reference/init.md`](../../source/skill/reference/init.md) | 172 | Generation's **upstream**: writes `PRODUCT.md` (register) and hands off to `document` (`:134`, auto-detect scan vs seed). (06b §2a) |
| [`skill/scripts/lib/design-parser.mjs`](../../source/skill/scripts/lib/design-parser.mjs) | 842 | The only code *near* generation — and it **reads** `DESIGN.md` prose back into a render model, stamping a *different* `schemaVersion: 2` (`:830`). Not the sidecar's writer. (06b §1b) |
| **Consumption + enforcement** | | |
| [`cli/engine/design-system.mjs`](../../source/cli/engine/design-system.mjs) | 750 | **The enforcement reader.** Loads both halves (own YAML-subset parser + `JSON.parse`), folds → allowed set, flags `design-system-color/-font/-radius` drift within tolerance via two front-ends (raw-text scan `:512` + computed-style DOM walk `:584`), deduped twice (`:724`, `:704`). Called by `cli/main.mjs:139`, `detect-text/html`, `hook-lib.mjs:1229`. (06c) |
| [`skill/scripts/live-server.mjs`](../../source/skill/scripts/live-server.mjs) | 1134 | `/design-system.json` (`:537-596`): merges raw sidecar + parsed `DESIGN.md` + `mdNewerThanJson`. (06c §4) |
| **The register conditioner** | | |
| [`skill/reference/brand.md`](../../source/skill/reference/brand.md) | 108 | Brand motion doctrine: ambitious page-load choreography (`:86,88,105`). (06c §5) |
| [`skill/reference/product.md`](../../source/skill/reference/product.md) | 60 | Product motion doctrine: `150–250 ms`, state-not-decoration, no page-load (`:38,40-42`). (06c §5) |
| **The worked example** | | |
| [`demos/landing-demo/DESIGN.json`](../../source/demos/landing-demo/DESIGN.json) | 281 | Demo sidecar; the `{name,value,duration?,purpose}` motion shape + reserved `ease-card` (`:155-168`). (06a §6) |
| [`demos/landing-demo/DESIGN.md`](../../source/demos/landing-demo/DESIGN.md) | 207 | Demo prose the `narrative` is pulled from. (06a §5, 06b §5) |
| [`demos/landing-demo/PRODUCT.md`](../../source/demos/landing-demo/PRODUCT.md) | 39 | The bare `## Register` value (`brand`, `:5`). (06c §5) |
| **YoinkIt (the measured side)** | | |
| [`extension/capture-animation.js`](../../../../extension/capture-animation.js) **YoinkIt** | 1530 | The `__cap` engine; the `dump()` spec `{meta, evidence, summary, stagger, findings[]}` (`:1344-1368`). (06d §2) |
| [`CONTEXT.md`](../../../../CONTEXT.md) **YoinkIt** | 261 | Domain language: Signature, Confidence, Trigger, Note, Region, Pass. (06d §1) |
| [`docs/CONTRACT.md`](../../../../docs/CONTRACT.md) **YoinkIt** | 1215 | Run contract; `page-model.json` schema; the abstract `06-spec/spec.json`. (06d §1) |
| [`docs/ARCHITECTURE.md`](../../../../docs/ARCHITECTURE.md) **YoinkIt** | 410 | Pipeline + "measured not authored" + the real-browser constraint. (06d §1, §9) |

---

## 1. Orientation: a memory, three disciplines, one conditioner

Impeccable's design memory is a committed artifact (the sidecar half of a `DESIGN.md`
pair, 06a §1) backed by three disciplines and conditioned by one field:

- **The artifact** ([`06a`](06a-the-persisted-artifact.md)) — `.impeccable/design.json`,
  `schemaVersion: 2`, a bag of optional token-metadata blocks (`extensions.colorMeta`
  … `extensions.motion`), self-contained `components`, and a `narrative` of human
  intent. Committed to git, alongside `config.json` and `live/config.json`. It is the
  **junior half of a two-file memory**: the *sidecar* to a Stitch-standard root
  `DESIGN.md`, carrying exactly what Stitch's frontmatter schema rejects — and motion
  is one of those exiles (06a §1).
- **Generation** ([`06b`](06b-generation-and-migration.md)) — a **prompt, not a
  program**: `/impeccable document` has an **LLM write** the memory (`DESIGN.md`
  prose, then the sidecar as "extensions only") with no generator code behind it.
  Day-zero synthesis, never-silently-overwrite, seed mode (whose lone motion
  question produces no motion token), a documented v1→v2 reshaping migratable only
  by re-authoring. *YoinkIt's generation is the inverse: a deterministic
  `__cap.dump()` + fold with no prompt.*
- **Enforcement** ([`06c`](06c-the-enforcement-reader.md)) — `design-system.mjs`
  folds the memory into an allowed set (every `canonical` + every `tonalRamp` stop)
  and flags any color/font/radius in code that drifts off it **within a tolerance**;
  the live server merges it with the parsed prose for the panel.
- **The conditioner** ([`06c`](06c-the-enforcement-reader.md) §5) — a single
  `Register` value (`brand` | `product`) flips the downstream motion doctrine, so
  the same measured 1200ms reveal reads as "the point" (brand) or "a bug" (product).

```mermaid
flowchart TB
  subgraph GEN["GENERATION (06b) — LLM authors"]
    DOC["/impeccable document\nprose → 'extensions only' sidecar\nsynthesize-on-thin · v1→v2 migration"]
  end
  subgraph ART["THE ARTIFACT (06a) — committed memory"]
    DJ[".impeccable/design.json\nextensions.motion + 5 siblings\ncomponents · narrative"]
  end
  subgraph ENF["ENFORCEMENT (06c) — reader enforces"]
    DS["design-system.mjs\nallowed set ← canonical + tonalRamp\nflag drift within tolerance"]
    LS["live-server /design-system.json\nraw sidecar + parsed prose + mdNewerThanJson"]
  end
  REG["Register (06c §5)\nbrand | product\nflips motion doctrine"]
  DOC -->|writes| DJ
  DJ -->|read by| DS
  DJ -->|read by| LS
  REG -.conditions.-> DS
  DJ -.staleness mtime.-> LS
  style DJ fill:#0f3460,color:#eee
  style GEN fill:#16213e,color:#eee
  style ENF fill:#1a1a2e,color:#eee
```

The whole loop is **authored**: a model writes the tokens, the reader enforces code
against them, a staleness signal tells the model when to re-author. YoinkIt's
inversion keeps the loop and replaces the core — the tokens come from measurement,
and "off-system" means "unlike what the site actually does."

---

## 2. The motion block, in the context that makes it legible

The survey's stop-you-in-your-tracks quote is the entire `extensions.motion` of
Impeccable's own design system ([`design.json:226-232`](../../source/.impeccable/design.json)):

```json
"motion": [
  {
    "name": "ks-ease",
    "value": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "purpose": "Default kit easing for color, border, and transform transitions."
  }
]
```

Read in isolation this looks like a motion schema. Read in context
([`06a`](06a-the-persisted-artifact.md) §3) it is **one `{name, value, purpose}`
row** in a token-metadata family — identical in shape to `shadows`, one of six
sibling blocks — carrying a *single easing curve* and **no duration**. The duration
of Impeccable's actual hover transitions (180ms) lives inline in `components[].css`
(`:285`), not in the motion token. So the authored artifact tokenises the *curve*
(reusable) and leaves the *duration* uncaptured.

**The memory is a lossy projection of the project's own motion** (06a §3d). The
same repo's CSS uses `var(--ks-ease)` **112 times** at **eight distinct inline
durations** (180ms × 56, down to 360ms × 1), plus a *second* easing (`--ease-out`)
and a five-step duration ladder (`--duration-fast` … `--duration-slowest`,
[`tokens.css:59-63`](../../source/site/styles/tokens.css)). The memory recorded **1**
of roughly **16** real motion values; the single most-used value in the whole system
— the 180ms default — appears **56 times in CSS and zero times in the memory**.
Motion is also the least-documented dimension in the file: 1 of 31 extension tokens
(1.7% of the bytes), and **0** of the 11 narrative rules / 8 dos / 10 donts mention
it. In the authored memory motion is an afterthought; in YoinkIt's measured memory
it is the whole point.

That asymmetry is the report's hinge. A **measured** memory has the opposite
pressure: YoinkIt measures duration cleanly first and most often *cannot* read
easing (rAF/JS-driven motion yields `easing: "unknown (rAF/JS) — verify"`,
[`capture-animation.js:666-667`](../../../../extension/capture-animation.js)). So
YoinkIt's `motion.json` inverts the emphasis — duration and per-layer timeline are
first-class measured fields, easing carries a confidence marker — while keeping the
`{name, value, purpose}` row as the interop seam back to Impeccable
([`06d`](06d-a-motion-json-for-yoinkit.md) §4-5).

---

## 3. The mechanism worth stealing: memory as a tolerance-gated linter

`design-system.mjs` is the proof that "memory is an enforcement contract, not
passive docs" ([`06c`](06c-the-enforcement-reader.md)). It reads the sidecar's
`colorMeta` — **every** `canonical` and **every** `tonalRamp` stop — into an
allowed-color set ([`design-system.mjs:260-273`](../../source/cli/engine/design-system.mjs)),
and flags any color in code that is not **within `COLOR_CHANNEL_TOLERANCE = 6`
channels** of an allowed color ([`:396-408`](../../source/cli/engine/design-system.mjs)),
emitting a `design-system-color` finding the hook surfaces on every edit. Radii get
the same treatment within `RADIUS_TOLERANCE_PX = 0.5`. Colors compare **as parsed
values, not strings**, on both the allow side and the dedup side
([`:681-702`](../../source/cli/engine/design-system.mjs)).

```mermaid
flowchart LR
  subgraph IMP["IMPECCABLE — authored ideal"]
    M1["design.json.extensions.colorMeta\ncanonical + tonalRamp[]"]
    M1 --> S1["allowedColorKeys (Map)"]
    S1 --> F1["flag code color NOT within\nCOLOR_CHANNEL_TOLERANCE=6\n→ design-system-color"]
  end
  subgraph YOI["YOINKIT — measured norm"]
    M2["motion.json.tokens\neasings[] + durations[]"]
    M2 --> S2["allowedEasings / allowedDurations"]
    S2 --> F2["flag new capture/recreation easing\nNOT within EASE_TOLERANCE\n→ motion-off-easing"]
  end
  F1 -. same mechanism .-> F2
  style F1 fill:#1a1a2e,color:#eee
  style F2 fill:#0f3460,color:#eee
```

YoinkIt's `motion.json` linter ([`06d`](06d-a-motion-json-for-yoinkit.md) §7) is
this file with the **truth-source inverted**: read the site's measured easing /
duration vocabulary into an allowed set, flag a new capture or a recreation whose
motion drifts off it within an easing/duration tolerance, weighted by `confidence`
and `register`. The data structure is identical; "off-system" flips from "unlike the
authored ideal" to "unlike what the site empirically does." That single inversion is
the whole product idea: **a capture tool that also lints motion consistency.**

---

## 4. The payoff in one screen: `__cap.dump()` → `.yoinkit/motion.json`

[`06d`](06d-a-motion-json-for-yoinkit.md) writes the schema out in full; the
correspondence at a glance:

| Impeccable `design.json` (authored) | YoinkIt `motion.json` (measured) | Inversion |
|---|---|---|
| `schemaVersion` / `generatedAt` / `title` | same | **ADOPT** the frame verbatim |
| `extensions.motion[] = {name,value,purpose}` | `tokens.easings[]/durations[] = {name,value,purpose, confidence, observedIn}` | extend the interop row with measured fields |
| LLM authors tokens (`/impeccable document`) | the **fold**: a pure fn of `__cap.dump()` | **drop** authoring; no value is invented |
| `narrative` (LLM intent prose) | `narrative` from human **Notes** (`CONTEXT.md:248`) | same slot, opposite origin |
| `Register` brand/product (whole-site, authored) | `register` signature/incidental (per-motion, from `importance`) | YoinkIt's native axis |
| `design-system.mjs` flags off-**authored**-ideal | motion linter flags off-**measured**-norm | same mechanism, truth-source inverted |
| day-zero **synthesize** a default token | **never** — coverage shows thinness | the catch |
| `mdNewerThanJson` (memory lags source) | `sourceChangedSinceCapture` (re-capture, can't re-author) | reader heuristic, reframed |

A `motion.json` token is a valid `extensions.motion` row, so a YoinkIt capture can
**seed an Impeccable motion block with measured tokens** — the one thing
Impeccable's generation path cannot produce. The reverse imports as `confidence:
"unknown"`. That asymmetry is the inversion enforced in a single field
([`06d`](06d-a-motion-json-for-yoinkit.md) §5).

---

## 5. Patterns for YoinkIt

Ranked by leverage for building the measured motion memory. Each is expanded in the
named sub-dive, with tags matching the survey's scheme (**ADOPT** a pattern/schema,
**EXPLORE** worth prototyping, **INSPIRATION** a stance).

1. **The durable artifact — ADOPT.** A committed, `schemaVersion`/`generatedAt`-
   stamped `.yoinkit/motion.json` (`tokens` + `motions` by Region + `narrative` +
   `coverage`) replacing N throwaway gitignored `*.animation.json`. The single
   highest-value move; it is the *object* YoinkIt lacks.
   *([`06a`](06a-the-persisted-artifact.md), [`06d`](06d-a-motion-json-for-yoinkit.md) §3)*

2. **The fold (`__cap.dump()` → memory) — ADOPT.** A pure function from a capture
   spec + existing memory to a new memory. No authoring step exists in it; that is
   what keeps the object measured. *([`06d`](06d-a-motion-json-for-yoinkit.md) §4)*

3. **The motion-consistency linter — ADOPT (truth-source inverted).** `design-system.mjs`'s
   allowed-set + tolerance-flag mechanism, reading the site's measured easing/duration
   vocabulary and flagging new motion off it (`motion-off-easing/-duration`), weighted
   by confidence and register. *([`06c`](06c-the-enforcement-reader.md) §2-3, [`06d`](06d-a-motion-json-for-yoinkit.md) §7)*

4. **The `{name,value,purpose}` interop seam — ADOPT.** Measured tokens that are
   valid `extensions.motion` rows, so a YoinkIt capture can seed an Impeccable motion
   block (one direction; reverse imports as `confidence: unknown`).
   *([`06a`](06a-the-persisted-artifact.md) §3d, [`06d`](06d-a-motion-json-for-yoinkit.md) §5)*

5. **The lifecycle disciplines (not the generator) — ADOPT.** Stamp versions, never
   silently overwrite, ship a thin memory that commits to enrichment (seed mode),
   track staleness as a reader-side mtime/hash heuristic. All inversion-safe. But
   **don't** grow a `document.md`: Impeccable generates with a non-deterministic
   prompt, YoinkIt already has the better, deterministic generator.
   *([`06b`](06b-generation-and-migration.md) §1, §7)*

6. **The motion `narrative` — EXPLORE.** Pair measured tokens with human-intent prose
   from Notes (not an LLM), so the memory says what is load-bearing.
   *([`06a`](06a-the-persisted-artifact.md) §5, [`06d`](06d-a-motion-json-for-yoinkit.md) §5)*

7. **The per-motion `register` tag — EXPLORE.** `signature`/`incidental` (preserve vs
   normalise), mapped from YoinkIt's `importance` enum, with an optional coarse
   brand/product `siteRegister` fallback. *([`06c`](06c-the-enforcement-reader.md) §5, [`06d`](06d-a-motion-json-for-yoinkit.md) §6)*

8. **The motion panel + URL lab — EXPLORE (Territory 3 seam).** The live-merge
   contract gives a panel that renders captured timelines beside human Notes.
   *([`06c`](06c-the-enforcement-reader.md) §4, [`06d`](06d-a-motion-json-for-yoinkit.md) §8)*

9. **Confidence as the spine; coverage shows thinness; never synthesize —
   INSPIRATION.** The disciplines that keep an accumulating measured memory from
   decaying into an authored one. The catch, made structural — including the four
   authoring moves to refuse (synthesize-on-thin, reserved tokens, denormalized
   motion, the Motion-energy laundering).
   *([`06b`](06b-generation-and-migration.md) §4, §9, [`06d`](06d-a-motion-json-for-yoinkit.md) §9)*

---

## Appendix: surprises / risks / drift

- **`.impeccable/` is three tracked files, and `design.json` is a *sidecar*.** `git
  ls-files` returns `config.json`, `design.json`, `live/config.json` — a multi-concern
  committed store. And `design.json` is only the junior half of the design memory: the
  sidecar to a Stitch-standard root `DESIGN.md`, holding what Stitch's frontmatter
  schema rejects. (06a §1)
- **Motion is homeless in the inherited format.** The Stitch `DESIGN.md` Zod schema
  has no motion slot (`document.md:47,429`); motion is exiled into the free-form
  `extensions` bag. That is *why* `extensions.motion` is one row, and the strongest
  argument that YoinkIt cannot fork Impeccable's format — a motion tool must make
  motion the top-level subject, not an extensions guest. (06a §1a, §2b)
- **Generation is a prompt, with no program behind it.** `/impeccable document` is
  429 lines of English; no code writes the sidecar (grep clean), and the only nearby
  code (`design-parser.mjs`) reads the prose *back*. So the "mature" static-design
  tool generates by asking a model nicely, while the "throwaway" motion tool
  generates by measuring (`__cap.dump()` + a pure fold). For generation
  specifically, YoinkIt's half is the deterministic, testable, can't-invent one —
  don't trade it for a `document.md`. (06b §1, §8)
- **The Motion-energy question proves the format can't hold motion.** The one moment
  generation asks how a design should move (seed-mode Q3, `document.md:368`) feeds
  the answer into Overview voice and a flat-vs-layered *shadow* decision (`:389,392`)
  and emits **no motion token**. Motion is generation input, never output — the
  strongest single argument that a motion tool cannot fork this format. (06b §4d)
- **A v1 `design.json` reads as empty, not migrated.** No reader branches on
  `schemaVersion` ([`design-system.mjs`](../../source/cli/engine/design-system.mjs)
  has none; [`live-server.mjs:545`](../../source/skill/scripts/live-server.mjs) only a
  comment), and the field name is a scattered convention reused on ≥4 unrelated
  artifacts. The "migratable schema" is migratable by **regeneration**, which YoinkIt
  cannot do (it must re-measure) — so a YoinkIt reader must fail *visible*, not
  *silent-empty*. (06b §6)
- **`mdNewerThanJson` lives in two readers with no shared helper.** Computed
  identically at [`design-system.mjs:386`](../../source/cli/engine/design-system.mjs)
  and [`live-server.mjs:574`](../../source/skill/scripts/live-server.mjs) — the
  hand-sync hazard [`05c`](../05-hook-system/05c-config-and-ignore-model.md) §5 warns
  about, here in the design-memory slice. (06b §7, 06c §4)
- **The schema is loose: real ≠ demo ≠ spec ≠ fixture.** The real artifact, the
  worked-example demo, the `document.md` schema, and a sveltekit test fixture disagree
  on `description`, `roundedMeta`, `shadows` emptiness, `motion[].duration`, ramp
  length (3–25 extracted vs a synthesised 8), and even the top-level key names (the
  fixture uses `version`/`source`). The reader tolerates it (every block guarded by
  `typeof` / `Array.isArray`), which is a feature to copy and a precision trap for
  anyone citing "the schema." (06a §6)
- **Enforcement reads both halves of the memory; only fonts are single-source.**
  The allowed-*color* set is fed by `frontmatter.colors` **and**
  `sidecar.colorMeta` (`design-system.mjs:347-348`); allowed *radii* by
  `frontmatter.rounded` **and** `sidecar.roundedMeta` (`:349-350`). The sidecar
  contributes the *ramps* the flat frontmatter list lacks; for radii the frontmatter
  is the *richer* source. Only allowed *fonts* are single-source —
  `frontmatter.typography`, not the sidecar's `typographyMeta` (`:275,346`). "Colors
  and radii come from the sidecar" is half the picture; the reader merges both files,
  which is also why the panel must merge them. (06c §2-3)
- **The motion token is curve-only, lossy, and not even self-consistent.** `ks-ease`
  is a curve referenced at 180ms in component CSS (`design.json:285`); the token has no
  duration. The same repo's CSS uses the curve 112 times at 8 inline durations, plus a
  second easing and a 5-step duration ladder — the memory kept 1 of ~16 motion values,
  and the 180ms default (56 uses in CSS) is captured 0 times. Worse, one of the six
  shipped components (the Live Picker Bar, `design.json:325`) uses generic `0.15s ease`,
  not `ks-ease` at all — the authored memory drifts from even its own artifact. The
  blind spot (uncaptured, idealized timing) is exactly the measured memory's strength.
  (06a §3d)
- **The `Register` field is a fallback, not a switch.** Task cue → surface → field,
  first match wins (`source/CLAUDE.md`). The "one-field conditioner" holds only when
  the first two are absent or agree. (06c §5)
- **The richest motion vocabulary YoinkIt ever wrote is archived.** The concrete
  `animations.json` field set (`tokens`, `patterns`, `lead{from,to,duration,ease,
  easeBezier}`, `confidence`, `timelineRef`) lives in
  `docs/archive/legacy-capture-pipeline/SPEC.md:143-181`, demoted by `CLAUDE.md` to
  historical. The `motion.json` proposal re-grounds it on the *current* `__cap.dump()`
  output and the place-first page model. (06d §1, §3)
