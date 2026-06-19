# Impeccable: Unexplored Territory (the other half)

> A forward-looking companion to the five subsystem reports. Where reports 01-05
> mapped Impeccable onto **what YoinkIt is today**, this document maps the half of
> the repo the audit skipped on purpose: the product surface, the proof machinery,
> the persisted artifact, and the release spine. The lens here is **generative**,
> not extractive: not "what can we steal" but "what could YoinkIt become."
>
> Audited against `source/` at the same commit as the rest of the audit. Built from
> four parallel territory sweeps; line numbers were accurate at sweep time and the
> upstream repo moves, so treat them as approximate and re-verify against `source/`
> if a specific line matters.

## What this is, and the lens shift

The executive summary's framing was **same shape, opposite physics**: Impeccable and
YoinkIt solve the same problems (understand an arbitrary page, run from a real
browser, collaborate with an agent) with inverted bottlenecks. Reports 01-05 chased
that correspondence to the floor. Everything they cover already has a YoinkIt
counterpart.

This document is the opposite move. It looks at the parts of Impeccable that have
**no YoinkIt counterpart yet**, because those are where a new product angle can come
from. The four territories below are ranked by how much new direction they open for
YoinkIt, not by how much code transfers. Most of what follows is tagged **EXPLORE**
(a direction worth prototyping) or **INSPIRATION** (a stance to internalise) rather
than **ADOPT** (drop-in), because these are roads, not parts.

The two territories the audit was steered to lead with, **persisted design-memory**
and **proving it works**, are ranked 1 and 2.

## The four territories at a glance

| # | Territory | What it is in Impeccable | The new angle for YoinkIt | Rank |
|---|---|---|---|---|
| 1 | **Persisted design-memory** | `.impeccable/design.json`: a durable, versioned, git-tracked per-project design system, with a `motion` sub-schema already in it | A persistent **motion memory** (`motion.json`) that accumulates captures into a site's reusable motion language, instead of throwaway per-capture specs | **HIGH** |
| 2 | **Proving it works** | An external A/B evals harness + an in-repo test architecture for browser- and LLM-dependent behaviour | A falsifiable **fidelity proof**: "an agent recreates the animation better from YoinkIt's spec than without it", measured in YoinkIt's own per-frame units | **HIGH** |
| 3 | **Product-as-its-own-demo** | An Astro site that runs the real detector in-browser, simulates every command, and fails its own build on AI-prose tells | An interactive **"paste a URL, see the captured motion spec"** playground + a fidelity gallery that doubles as proof and marketing | **MED-HIGH** |
| 4 | **Distribution & release** | HTTP download API, plugin marketplace, three independently-versioned components, a release script with safety gates | A real **release spine**: per-component versioning, a release script that refuses on stale state, a one-command install path | **MED** |

## The through-line (why these four are one story, not four lists)

These are not four disconnected ideas. They compose into a single forward arc for
YoinkIt:

- Territory **1** is the *artifact*: a durable motion memory is the thing worth
  producing.
- Territory **2** is the *proof*: the same A/B that validates a spec is faithful
  ("agent recreates from spec vs without it") is what makes the artifact
  trustworthy.
- Territory **3** is the *showcase*: the recreations that the proof produces are
  exactly the before/after gallery the site needs. Proof and marketing are the same
  pixels.
- Territory **4** is the *delivery*: the motion memory and the engine are what the
  release spine ships.

Read top to bottom, it is a plausible roadmap: build the artifact, prove it,
showcase the proof, ship it.

---

## Territory 1 — Persisted design-memory → a "motion memory" for YoinkIt

**Rank: HIGH (lead).** The single most generative territory for product direction.
Impeccable has already built and shipped the thing YoinkIt structurally lacks, and
its schema already contains a motion section.

### What it is, and where

`.impeccable/design.json` is a durable, **git-tracked** (`git ls-files .impeccable/`
returns it), **versioned** (`schemaVersion: 2`) per-project design system captured
from the project and committed into the repo. It is the polar opposite of YoinkIt's
throwaway-per-capture model: it accumulates across sessions and survives in version
control.

Top-level shape (`.impeccable/design.json:1-5`): `schemaVersion`, `generatedAt`
(ISO-8601), `title`, then three big keys: `extensions`, `components`, `narrative`.

- `extensions.colorMeta` (`:6-173`): each token carries `role`, `displayName`,
  `canonical` OKLCH, a prose `description` of where it is used, and a variable-length
  `tonalRamp` (dark to light, synthesised in OKLCH when the source page has no scale).
- `extensions` also holds `typographyMeta`, `shadows`, `breakpoints`, `roundedMeta`,
  and `motion`.
- `components` (`:278-327`): 5-10 representative primitives, each with a self-contained
  drop-in `html` + `css` so a live panel can render it in a shadow DOM with no runtime.
- `narrative` (`:328-418`): the human-intent layer **inside** the machine file:
  `northStar`, `overview`, `keyCharacteristics[]`, named `rules[]`, and `dos[]` /
  `donts[]`, pulled verbatim from the project's `DESIGN.md`.

### The part that should stop YoinkIt in its tracks

Impeccable's domain is *static* design systems. YoinkIt's domain *is* motion. Yet it
is Impeccable, not YoinkIt, that already ships a motion schema. From
`.impeccable/design.json:226-232`, verbatim:

```json
"motion": [
  {
    "name": "ks-ease",
    "value": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "purpose": "Default kit easing for color, border, and transform transitions."
  }
]
```

The worked example extends the same shape with `duration` (and a "reserved but
unused" token convention), `demos/landing-demo/DESIGN.json:155-168`:

```json
"motion": [
  { "name": "ease-button", "value": "ease", "duration": "150ms",
    "purpose": "Default easing for button hover transforms." },
  { "name": "ease-card",   "value": "ease", "duration": "300ms",
    "purpose": "Card hover transition (currently unused but reserved)." }
]
```

So the lived schema is `{ name, value (bezier or keyword), duration?, purpose }`. It
is a thin, **prescriptive** motion vocabulary: the rules a project *should* follow,
authored by an LLM. YoinkIt's specs are the opposite: **measured** observations of
what a page actually does, frame by frame. That gap is exactly where a new object
lives.

### How it is generated, read, and migrated (the discipline)

- **Generation** is LLM-driven, not a parser: `/impeccable document` writes
  `DESIGN.md` (prose), then writes the JSON sidecar as "extensions only", the metadata
  the prose frontmatter cannot hold (`skill/reference/document.md:240-244`).
- **Consumption** has two readers. The audit detector
  (`cli/engine/design-system.mjs:260-419`) reads every `canonical` and `tonalRamp`
  stop into an allowed-color set and **flags code that drifts off-system**: the memory
  is an enforcement contract, not passive docs. The live panel server reads it raw and
  merges it with parsed `DESIGN.md` into one response (`skill/scripts/live-server.mjs:538-600`).
- **Migration** is explicit: a documented v1 to v2 reshaping moved token primitives
  out of the sidecar into frontmatter and reduced the sidecar to keyed metadata;
  readers branch on `schemaVersion`; a `mdNewerThanJson` signal surfaces staleness.
  This is what "a schema you can evolve without breaking old files" looks like in
  practice.

### The register taxonomy (a one-field conditioner)

`PRODUCT.md` carries a bare `## Register` value, `brand` or `product`
(`PRODUCT.md:3-5`). That single field flips the entire downstream doctrine, including
motion: `skill/reference/brand.md:86-88` permits ambitious first-load choreography
("one well-orchestrated page-load beats scattered micro-interactions"), while
`skill/reference/product.md:38-42` mandates "150-250ms on most transitions... motion
conveys state, not decoration... no orchestrated page-load sequences". The same
captured 1200ms reveal means "the point" on a brand hero and "a bug to fix" on a
product button.

### New angles for YoinkIt

- **A durable, versioned `motion.json`.** Persist captures into a committed,
  `schemaVersion`-stamped artifact that accumulates a site's motion language across
  captures, instead of independent throwaway specs. A recreating agent reads one stable
  file rather than N loose ones. Impeccable proves the pattern (git-tracked, migratable,
  enforcement-feeding) works. **ADOPT (the pattern).**
- **Reuse Impeccable's `motion` block as the schema seed.** Start from
  `{ name, value, duration, easing, purpose }` and extend with YoinkIt's measured
  fields (per-layer timeline, trigger, captured easing). A YoinkIt motion token could
  drop straight into an Impeccable `extensions.motion` array, which is free interop.
  **ADOPT (the schema).**
- **Pair the machine spec with human-intent prose (a motion `narrative`).** A raw
  frame timeline tells an agent *what* moved, not *why* or *what is load-bearing vs
  incidental*. Impeccable shows machine tokens and prose intent can live in one file,
  and that the prose is what keeps output from going generic. **EXPLORE.**
- **A "motion register".** Tag each capture `brand` (signature choreography, reproduce
  faithfully) or `product` (state feedback, normalise to convention). It tells the
  recreating agent whether to *preserve* or *normalise* a measured duration. **EXPLORE.**
- **Memory that feeds drift-detection.** Once a site's motion language is durable,
  flag *new* animations that violate it (wrong easing, off-token duration), exactly how
  `design-system.mjs` flags off-system colors. A capture tool becomes a motion-consistency
  linter. **INSPIRATION.**
- **Synthesise-on-day-zero + stale hints.** When a capture is thin, synthesise a
  plausible default token so the artifact always has something to render
  (`document.md:313`), and track a `mdNewerThanJson`-style staleness signal so the agent
  knows when the memory lags the source. The difference between a one-shot tool and
  persistent project memory. **INSPIRATION.**

### The catch

Impeccable's motion is prescriptive and authored; YoinkIt's is measured and observed.
Do not copy the generation path (an LLM inventing tokens). The new object is a
*measured* motion memory that crystallises observed animation into a reusable,
enforceable language. That object exists in neither tool today, which is precisely why
it is the strongest angle.

Key refs: `.impeccable/design.json` (`motion` at `:226-232`),
`cli/engine/design-system.mjs:260-419` (consumer/enforcer),
`skill/reference/document.md:240-329` (generation + v1→v2 migration),
`skill/reference/{brand,product}.md` (register + motion doctrines),
`demos/landing-demo/{DESIGN.json,DESIGN.md,PRODUCT.md}` (worked example).

---

## Territory 2 — Proving it works

**Rank: HIGH (lead).** YoinkIt's central unproven claim ("the captured spec is
faithful enough for an agent to recreate the animation") maps one-to-one onto
Impeccable's central unproven claim ("the skill improves AI design"). Impeccable has
already built the machinery to test exactly that, under the same hard constraint
(headless fires nothing) and the same problem (subjective generative output you cannot
unit-assert).

### The evals concept (external, but governed from this repo)

The eval framework is a separate private repo (`~/code/impeccable-evals/`, not present
in this clone) but is described in `source/CLAUDE.md:333-348`. It measures whether the
skill improves or harms AI-generated design by **running the same brief through a model
with and without the skill loaded**: an ablation study, not an assertion. It is kept
separate but tethered, reading the live skill from `../impeccable/skill/`, and a strip
list (`runner/inline-skill.ts`) must stay in sync with `SKILL.md`'s headings so the
proof always runs against current source.

The lesson: a subjective-quality tool cannot be unit-tested for "good". You hold the
brief constant, toggle the single variable, and compare.

### The in-repo test architecture (concrete)

- **Golden anti-pattern fixtures + a non-negotiable TDD order**
  (`tests/fixtures/antipatterns/`, `tests/detect-antipatterns-fixtures.test.mjs`,
  process in `CLAUDE.md:315-331`): fixture first, failing test, rule, pure check, two
  adapters, live check. Floor of >=4 flag / >=5 false-positive cases per rule. The
  fixture test asserts on `snippet` substrings *and* exact finding counts per column.
- **A framework-fixture matrix** (`tests/framework-fixtures/`, ~33 projects): Vite /
  Next / SvelteKit / Nuxt / Astro crossed with CSP shapes and styling engines
  (styled-components, emotion, tailwind v3/v4, unocss, vanilla-extract). Each carries a
  `fixture.json` and is staged into a tmp git repo (`tests/framework-fixtures/README.md`).
- **Live-mode E2E** (`tests/live-e2e.test.mjs`): does real `npm install`, boots the
  framework's real dev server, opens Playwright Chromium, and asserts a **browser-side
  oracle** (`window.__IMPECCABLE_LIVE_INIT__ === true`) through the full settle → pick →
  cycle → accept → carbonize flow. The agent is a **pluggable one-method interface**
  (`tests/live-e2e/agent.mjs:71-75`, `generateVariants(event, context) → {scopedCss, variants[]}`)
  with a deterministic **fake agent** (default, format-faithful, free) and an optional
  real-LLM agent (`tests/live-e2e/agents/llm-agent.mjs`) that caches the whole spec as
  its prompt prefix so a 19-fixture sweep pays full input cost once.
- **Skill-behavior LLM tests** (`tests/skill-behavior/scenarios.test.mjs`): inlines
  `SKILL.src.md` into a real LLM's system prompt across **three providers**
  (claude-sonnet-4-6, gpt-5.5, gemini) and asserts on the recorded **tool-call trace**,
  not free-form output. Provider divergence is treated as the signal, not noise
  (`CLAUDE.md:173`).
- **Suite split with reasons encoded** (`scripts/test-suites.mjs`): 4 default + 5
  opt-in suites, each with path-regex triggers; the slow/expensive ones (real installs,
  real browsers, paid APIs) are gated out of default. A `bun` vs `node --test` split
  exists because jsdom is too slow under bun, which is the same headless-rendering
  limitation YoinkIt fights.

### Non-obvious moves worth internalising

- **Assert on the trace, not the prose.** Judging *which files an agent loaded and in
  what order* is verifiable; judging output quality is not. This sidesteps the
  unverifiable-subjective-output problem entirely.
- **A fake agent engineered to be assertable.** Not a no-op stub: it emits real,
  format-faithful variants with values reverse-chosen so `getComputedStyle` can confirm
  them, exercising the whole write-back path with zero API cost or flake.
- **The spec is the cached prompt prefix.** That is the trick that makes real-model
  E2E affordable enough to run at all.

### New angles for YoinkIt

- **Invert the ablation: "recreate from spec" vs ground truth.** Hold a known source
  animation constant, give an agent (a) only a screenshot/description vs (b) YoinkIt's
  full spec, have it write the recreation, then **capture the recreation's own frame
  timeline and diff it against the original's**. The metric (frame-timeline distance)
  is YoinkIt-native. This is the missing falsifiable proof the entire product rests on.
  **EXPLORE.**
- **A golden corpus of known animations with per-frame oracles.** Hand-authored
  animations (CSS transition, keyframe, GSAP tween, Webflow IX2 hover) with committed
  expected timing/easing/per-layer values; assert `__cap.dump()` matches within
  tolerance. Mirror the ">=N positive / >=N negative" floor: include static decoy
  elements that must yield **zero** moved layers, to catch false captures. Turns thin
  tests into a regression net around the single `capture-animation.js` file. **ADOPT.**
- **A Playwright + real-dev-server capture harness with a browser-side oracle.** Copy
  the `live-e2e.test.mjs` shape: boot a real page, drive a **real** hover/scroll/click
  (headed, the only thing that fires IX2/GSAP), then read `window.__capLast` after a
  `settle → arm → trigger → wait → dump` cycle. It is the only test architecture that
  respects YoinkIt's hard constraint, and it proves the capture path end to end rather
  than spec-parsing in isolation. **ADOPT.**
- **A pluggable recreate-agent interface + deterministic fake.** Define
  `recreate(spec) → code` with a deterministic fake that emits a known-correct
  recreation, so the whole "spec → recreation → score" pipeline is CI-runnable cheaply,
  and the real LLM (spec cached as prefix) is an opt-in swap. The same two-tier split
  Impeccable uses to keep proof affordable. **ADOPT.**
- **Provider divergence as a spec-sufficiency signal.** Run the recreate A/B across
  2-3 providers. If every model recreates faithfully, the spec is self-sufficient; if
  only the strongest does, the spec is under-specified and leaning on model priors.
  That is the cleanest test of YoinkIt's actual value proposition. **INSPIRATION.**

Key refs: `CLAUDE.md:333-348` (evals), `tests/detect-antipatterns-fixtures.test.mjs`,
`tests/framework-fixtures/README.md`, `tests/live-e2e.test.mjs`,
`tests/live-e2e/agent.mjs:71-75`, `tests/skill-behavior/scenarios.test.mjs`,
`scripts/test-suites.mjs`, `scripts/benchmark-detector.mjs`.

---

## Territory 3 — Product-as-its-own-demo

**Rank: MED-HIGH.** YoinkIt's entire public face today is a README and the skill.
Impeccable's site is itself a working demo of the product, and a chunk of it doubles as
the proof surface that territory 2 would generate.

### What it is, and where

- **A live detector lab** (`site/pages/detector/index.astro` + `site/pages/detector/fixtures/`):
  the real engine runs **in-browser** against ~26 fixture categories, static (jsdom) and
  live scans side by side, findings surfaced by rule. The product exercising itself in
  public.
- **A demo-renderer** (`site/scripts/demo-renderer.js`, `site/scripts/demos/commands/*.js`):
  16 commands each shown as a curated before/after split. Note: it is **structural, not
  behavioral**: the after-state is human-authored HTML, a proof-of-concept by curation,
  not by running an LLM live.
- **Docs-as-data** (`site/content/`, `site/content.config.ts`): skill editorials,
  tutorials, and reference docs live in Astro content collections that the build and the
  site both read, so the marketing docs and the skill never drift. Plus
  `site/public/llms.txt` for AI crawler discoverability.
- **Proof surfaces**: a `neo-mirai` case study (generated mock → brand toolkit → shipped
  page, `site/pages/cases/neo-mirai.astro`), a curated 33-tweet testimonial marquee
  (`site/data/testimonials.js`), changelog and FAQ.

### The stance underneath it: eat your own dog food

This is the cross-cutting theme of the whole repo, and the most transferable thing in
this territory. Impeccable **polices its own output**:

- The build **fails on AI-prose tells** in its own marketing copy: em dashes, hollow
  words ("seamless", "robust", "empower"), throat-clearing ("in today's", "let's dive
  in"), 20+ rules each with a rationale (`scripts/build.js:143-235`, `docs/STYLE.md`).
  The slop catalog page is explicitly exempted because its job is to *contain* the bad
  patterns as specimens.
- The site is a **subject of its own detector**: `.impeccable/config.json` whitelists
  intentional "before-state slop" demos with timestamped reasons, so the tool detects,
  and knowingly allows, the violations it stages on purpose.
- The OG card generator reads the **live command count** so the marketing image can
  never go stale (`scripts/generate-og-image.js`).

### New angles for YoinkIt

- **An interactive "paste a URL, see the captured motion spec" lab.** The detector
  lab's analog for motion: accept a URL or inline HTML, pick an element, trigger a
  transition/hover/scroll, capture the timeline, render the spec JSON. It is the
  proof-of-capture YoinkIt has nowhere today. The honest caveat: YoinkIt's lab needs a
  *real visible browser* to fire framework handlers, so a fully client-side lab will
  under-capture; this likely wants a server-driven capture (a hosted headful runner)
  rather than pure in-page JS. **EXPLORE.**
- **A fidelity gallery that is also the proof.** For each entry: the source animation,
  the captured spec, and an agent-written recreation, side by side. This is the *output*
  of territory 2's recreate-from-spec A/B, published. Proof and marketing are the same
  pixels. **EXPLORE.**
- **Dogfood YoinkIt on its own site.** Capture YoinkIt's own product-page motion with
  YoinkIt, publish the specs next to the source. Signals confidence and gives agents a
  concrete reference. **ADOPT.**
- **A spec validator in the build** (mirroring the prose validator): fail the build if a
  published spec is incomplete or opaque (missing easing, empty summary, frame timeline
  below some sampling floor). Holds YoinkIt's own output to a standard. **INSPIRATION.**

Key refs: `site/pages/detector/index.astro`, `site/scripts/demo-renderer.js`,
`scripts/build.js:143-235`, `docs/STYLE.md`, `.impeccable/config.json`,
`site/content.config.ts`, `site/pages/cases/neo-mirai.astro`, `site/public/llms.txt`.

---

## Territory 4 — Distribution & release machinery

**Rank: MED.** The least "new angle" of the four and the most pure infrastructure, but
it is the spine YoinkIt will eventually need if the skill is to ship beyond hand-copy.
Note: the audit's report 04 already covered the *one-source → N-provider transform*;
this is the other half (hosting, versioning, release, packaging), not a re-cover.

### What it is, and where

- **An HTTP download API** on Cloudflare Pages Functions:
  `functions/api/download/bundle/[provider].js` serves a per-provider zip;
  `functions/api/download/[type]/[provider]/[id].js` serves an individual `SKILL.md`.
  Both validate against `cli/lib/download-providers.js`, which exposes **10 provider
  config dirs** (cursor, claude-code, gemini, codex, agents, github, kiro, opencode, pi,
  qoder) plus a `universal` bundle.
- **A plugin + marketplace** (`.claude-plugin/marketplace.json`, `plugin/`): the
  marketplace points at a **slim `./plugin` subtree** (~0.3MB) rather than the full repo
  (~291MB) for install-cache efficiency.
- **Three independently-versioned components** (`CLAUDE.md:216-254`): CLI
  (`package.json`), skills (`.claude-plugin/*.json`), extension
  (`extension/manifest.json`), released under separate tag prefixes `cli-v` / `skill-v`
  / `ext-v`. Bump only what changed.
- **A release script with safety gates** (`scripts/release.mjs`): refuses on a dirty
  tree, HEAD ahead of origin, an existing tag, a missing changelog entry, or
  **uncommitted generated output** (meaning the harness dirs were not refreshed before
  the bump).
- **CI that regenerates and commits** (`.github/workflows/sync-generated-output.yml`):
  on source changes to `main` it runs `build:release` and commits the regenerated
  provider permutations back to `main`, so the committed harness dirs are never stale.
- **A generated-asset pipeline**: OG card (`scripts/generate-og-image.js`), promo tile,
  extension icons, anti-pattern screenshots, all Playwright/Puppeteer-rendered.

### New angles for YoinkIt

- **A release script with safety gates.** Refuse to release on a dirty tree, unmatched
  versions, or stale generated output. YoinkIt has zero release discipline today; this is
  the single highest-ROI piece here and a direct foot-gun preventer. **ADOPT.**
- **Per-component versioning.** Engine (`capture-animation.js`), extension, and skill
  change at different cadences; version and tag them independently
  (`engine-v` / `ext-v` / `skill-v`). **ADOPT.**
- **A one-command install / download endpoint.** A `/api/download/skill/<provider>`
  serving the right `SKILL.md` per harness plus a universal zip, wired to a
  `npx`-style installer, replaces "copy the folder". This composes with report 04's
  single-source transform: generate once, host, install in one command. **EXPLORE.**
- **CI regenerate-and-commit.** Once YoinkIt adopts a single-source skill build, a
  workflow that rebuilds provider output and commits it back removes the manual sync
  step entirely. **INSPIRATION.**
- **Live-count assets.** The OG-image-reads-live-count trick generalises: any generated
  artifact that embeds a number (commands, rules, supported libraries) should read it at
  build time so it cannot go stale. **INSPIRATION (low priority).**

Key refs: `functions/api/download/*`, `cli/lib/download-providers.js`, `wrangler.toml`,
`.claude-plugin/marketplace.json`, `plugin/`, `CLAUDE.md:216-254`,
`scripts/release.mjs`, `.github/workflows/sync-generated-output.yml`,
`scripts/generate-og-image.js`.

---

## The cross-cutting stance to take away

Above any single feature, the repeated move across all four territories is **make the
tool answerable to its own standard**. The detector runs on its own site. The prose
validator fails the build on the AI-tells the product exists to remove. The release
script refuses when its own generated output is stale. The evals harness ablates the
product against itself. None of this is a feature; it is a posture, and it is the
cheapest one to adopt: a capture tool that captures its own site, validates its own
specs, and proves its own fidelity is far more credible than one that only asserts.

## Where to go deeper

This is the survey map. If any territory earns escalation, the natural next step is a
full deep-dive folder in the style of reports 01-05:

- **`reports/06-design-memory/`** (territory 1) would go to the floor on the
  `design.json` schema, the v1→v2 migration, the enforcement reader, and a concrete
  `motion.json` schema proposal for YoinkIt. Highest expected payoff.
- **`reports/07-proof/`** (territory 2) would design the recreate-from-spec harness, the
  golden corpus, and the frame-timeline distance metric in detail. Highest urgency
  against YoinkIt's current "no fidelity proof" gap.

Territories 3 and 4 are better left as this single section each until 1 and 2 are
acted on, since 3's gallery is downstream of 2's proof and 4 is infrastructure that
only pays off once there is something versioned to ship.
