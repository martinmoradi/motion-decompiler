# YoinkIt Contract

This is the procedural contract for YoinkIt runs. The architecture explains why
the product exists and what it is trying to preserve. This contract defines what
every agent, helper script, and generated artifact must obey.

If a skill prompt, helper note, or older scratch doc conflicts with this file,
this file wins.

## Inheritance Rule

YoinkIt inherits as much rigor as possible from `clone-app-pat-pro`, because that
workflow is proven to work. Relax the clone-app pattern only when it directly
conflicts with YoinkIt's product decisions.

Keep by default:

- explicit stage inputs and outputs
- fixed artifact paths
- evidence rules for every claim
- binary gates
- coverage manifests
- `null + reason` for unknowns
- hard human check-ins at gate boundaries
- measured convergence loops
- no silent warnings

Reject or relax where needed:

- no source-code, framework, or library fidelity
- no source architecture copying
- no pixel-diff gate for motion
- no pretending uncertain motion is more certain than the evidence supports

## Run Layout

Each yoink run writes to a single run directory. The exact root can be configured,
but the structure inside it is fixed.

When no explicit run directory is provided, `init` creates a deterministic run
directory under `yoink-runs/{host}/{yyyy-mm-dd}-{slug}/`, prints the absolute
path, and records it in `00-config.json`. `--run-dir` overrides the generated
path for callers that need a specific location.

```text
yoink-runs/{slug}/
├── 00-config.json
├── page-model.json
├── 01-recon/
│   ├── page-state.json
│   ├── viewport-manifest.json
│   └── source-metadata.json
├── 02-static-map/
│   ├── measurements.json
│   ├── assertions.json
│   ├── coverage.md
│   ├── crops/
│   └── assets/
├── 03-motion-scout/
│   ├── motion-candidates.json
│   ├── coverage.md
│   └── assertions.json
├── 04-map-report/
│   ├── index.html
│   ├── report-snapshot.json
│   └── gate.json
├── 05-capture/
│   ├── passes/
│   │   └── pass-001/
│   │       ├── pass.json
│   │       ├── clips/
│   │       └── crops/
│   └── results.json
├── 06-spec/
│   └── spec.json
└── 07-implement/
    ├── architecture/
    │   ├── file-tree.md
    │   ├── component-map.md
    │   ├── motion-map.md
    │   └── token-map.md
    ├── static-assertions.json
    ├── motion-assertions.json
    └── qa/
```

Earlier prototype paths such as `map.json`, `manifest.proposed.json`,
`animations.json`, and `report.md` are salvage material, not the contract.

`page-model.json` is the canonical artifact. Stage directories hold evidence,
assertions, projections, and logs that update or derive from it. No stage owns a
second copy of the Page model.

The Report and Spec are projections of `page-model.json`. They are never
hand-authored in parallel.

`04-map-report/report-snapshot.json` is the structured Report v0 projection
captured at generation time for downstream consumption, such as `map-gate`
reading hashes and summaries without scraping HTML. `page-model.json` remains
canonical.

Report Region placeholder positions and dimensions are derived from Region
geometry in `page-model.json`. The Report must not store separate geometry or
sizing facts that can drift from the Page model.

`00-config.json` is the shared interface between the agent skill and the
deterministic CLI. Skill arguments and CLI flags both compile into this file
before stage commands run.

It is also shared by `implement`. `06-spec/spec.json` is the main implementation
input, but operational settings such as output path, target stack, gate
tolerances, and check-in policy live under an `implement` section of the same run
config.

Every JSON artifact carries its own `schemaVersion`, including `00-config.json`,
`page-model.json`, `measurements.json`, `assertions.json`,
`motion-candidates.json`, and `gate.json`. Markdown coverage files may include
generated metadata but do not need a formal schema version.

Stage JSON outputs and gate records include stage-level timestamps such as
`generatedAt` or `updatedAt`. They do not need timestamps on every nested item.
These timestamps support audit trails, stale-artifact checks, and handoffs.

Gate-approved or gate-consumed projections include input hashes for freshness.
Report v0 snapshot metadata and `gate.json` include hashes of `page-model.json`,
Static Map assertions and coverage, and Motion Scout assertions and coverage.
Other stage outputs may start with timestamps only until they need stronger
freshness checks.

Minimum shape:

```json
{
  "schemaVersion": 1,
  "targetUrl": "https://example.com",
  "scope": "page",
  "viewports": [
    { "id": "desktop", "width": 1280, "height": 800 },
    { "id": "mobile", "width": 390, "height": 844 }
  ],
  "primaryViewport": "desktop",
  "outputDir": "./out/example",
  "yoink": {
    "mode": "observe"
  },
  "implement": {
    "targetStack": "house",
    "projectPath": "./out/example",
    "checkIns": true
  }
}
```

The skill and CLI may accept friendly shorthand, but the resolved
`00-config.json` stores explicit viewport dimensions. The schema is
multi-viewport from v0 so Regions have a stable spine across breakpoints. The
first Map workbench implementation is primary-viewport by default: it must
measure `primaryViewport`, and it measures additional viewports only when the run
explicitly requests them. Region shape still stores presence, geometry, crops,
and placeholder sizing per viewport so multi-viewport mapping can be widened
without changing the Page model.

Minimum `page-model.json` v0 shape:

```json
{
  "schemaVersion": 1,
  "source": { "url": "https://example.com" },
  "viewports": [
    { "id": "desktop", "width": 1280, "height": 800 }
  ],
  "pages": {
    "home": {
      "path": "/",
      "dimensions": {
        "desktop": { "scrollWidth": 1280, "scrollHeight": 4200 }
      },
      "regions": []
    }
  },
  "captures": [],
  "notes": [],
  "exceptions": []
}
```

Map v0 writes ordered Regions into the page's `regions` list. The capture,
notes, and exceptions buckets exist in the model from the start, but Capture
passes fill them later.

## CLI Boundary

The CLI is a deterministic stage runner. It reads `00-config.json`, reads and
writes the fixed run artifacts, and executes named stages such as `init`, `map`,
`report`, `map-gate`, `capture`, `merge-pass`, `spec`, and `validate`.

The CLI must not make product judgment calls:

- what part of the source is worth capturing
- whether a Report is good enough
- whether a `verify` motion is acceptable
- whether to waive a gate finding
- whether the yoink is complete

Those decisions belong to the agent session and the human gate.

The current `bin/yoinkit` is prototype material. Implementation work may salvage
working code from it, but must not preserve its monolithic shape or any
pre-contract command semantics that conflict with the Page model, Map Gate,
Report view modes, or deterministic stage-runner boundary.

The first stage-runner implementation replaces the public CLI surface for the
Map workbench. Legacy commands such as `scout`, `yoink`, `plan`, `assemble`, and
the old Markdown `report` are not compatibility aliases in this slice; they may
be mined from git history or local code only as implementation material.

Implement the first Map workbench slice test-first around pure stage behavior:
configuration parsing, run layout, `init`, stage idempotence, gate decisions,
Report freshness, and fixture-based Static Map and Motion Scout shaping. Use the
repo's existing `bun:test` style. Add live browser smoke only where a behavior
cannot be honestly covered with fixtures, such as Recon page probing.

Include a stable fixture page under `tests/fixtures/` for Static Map and Motion
Scout tests. It should cover at least header/nav, hero, repeated cards, footer,
a CSS hover, a keyframes loop, and a split-reveal-like DOM shape so Region
segmentation and candidate discovery can be tested without live-site drift.
Use an actual browser for stage integration tests that depend on layout,
computed styles, crops, visibility, or runtime registries. Use pure fixture data
for helper functions such as segmentation scoring, deduplication, and gate
decision logic.
For crop behavior, include one integration smoke proving crop files are created
and non-empty, while most tests cover crop metadata and `null + reason` handling.
Full image comparison is not required for Map workbench v0.

Keep `bin/yoinkit` as a thin CLI entrypoint. Put testable Map workbench logic in
small CommonJS modules under `lib/`, including configuration, run layout, and one
module per stage. Do not rebuild the first slice as another monolithic
executable.

Existing tested pure helpers may be moved into modules, but their behavior must
remain covered and green during the split. Either update the existing tests to
import the new modules in the same commit or temporarily re-export the helpers
from `bin/yoinkit`. Legacy user-facing commands can disappear; tested helper
behavior should not break accidentally.

Do not migrate old Capture, repair-loop, or Spec-shaping internals into the new
module layout just for tidiness during the Map workbench slice. Move only code
needed by the pre-Capture stages, such as shared browser or readiness utilities
for Recon, and leave out-of-scope Capture internals for the later Capture slice.

Update `README.md` only enough to keep the public command surface faithful to the
implemented Map workbench. The README should show the new
`init -> map -> map-gate` flow, state that Capture and full `yoink` commands are
out of scope until the next slice, and avoid presenting planned pipeline stages
as already implemented.

Implement the Map workbench slice on a feature branch and keep commits coherent
and semantic, following the repo guide. Natural commit boundaries are test
scaffolding, config/init, Recon, Static Map, Motion Scout, Report v0, Map Gate,
and README updates.

The first stage-runner slice exposes each pre-gate stage directly:

```text
yoinkit init <url>
yoinkit recon <run-dir>
yoinkit static-map <run-dir>
yoinkit motion-scout <run-dir>
yoinkit map-report <run-dir>
yoinkit map-gate <run-dir>
```

It also exposes one convenience command:

```text
yoinkit map <run-dir>
```

`yoinkit map` runs `recon -> static-map -> motion-scout -> map-report`, then
stops before `map-gate` so the human can review Report v0. `map-gate` is a pure
validator and recorder: it accepts an explicit decision from the agent session
after human review, checks that the required assertions and coverage allow that
decision, and writes `04-map-report/gate.json`. It does not decide approval
itself.

If a stage in `yoinkit map` fails, the command stops at that stage, leaves
completed artifacts in place, writes the stage's escalation or status artifact,
and exits non-zero. It must not generate a best-effort Report from incomplete
prerequisites unless the failed stage deliberately produced a partial artifact
with honest coverage failures.

`yoinkit map` is done when tests prove it runs
`recon -> static-map -> motion-scout -> map-report` in order; stops before
`map-gate`; stops on the first failed stage with a non-zero exit; leaves
completed artifacts intact; writes or propagates a stage status artifact; does
not generate a Report from incomplete prerequisites unless the partial artifact
is explicit; and prints the Report path on success.

`init` is a pure run-materialization step. It creates the run directory,
`00-config.json`, and the minimal `page-model.json` shell. It does not open a
browser, perform Recon, create placeholder stage outputs, or write coverage and
assertion artifacts for stages that have not run.

The first `init` surface accepts only the source URL plus run-configuration
shorthand: optional `--run-dir`, optional `--slug`, repeatable optional
`--viewport WIDTHxHEIGHT`, optional `--primary-viewport ID`, optional
`--output-dir`, and optional `--mode observe|automated`. Other settings can be
edited directly in `00-config.json` until they earn a public flag.

Viewport shorthand accepts either `WIDTHxHEIGHT` or `id=WIDTHxHEIGHT`. When a
viewport shorthand does not name an id, `init` assigns one from width: the first
viewport at least `900px` wide is `desktop`, the first `600-899px` viewport is
`tablet`, and the first below `600px` is `mobile`. Duplicate inferred ids get
numeric suffixes such as `desktop-2`. With no viewport flags, `init` creates one
`desktop` viewport at `1280x800`. If `--primary-viewport` is omitted, the first
configured viewport is primary.

`init` is done when tests prove it creates the deterministic or explicit run
directory, writes schema-versioned `00-config.json`, writes a minimal
schema-versioned `page-model.json`, resolves viewport shorthand and
`primaryViewport`, records output/project paths without creating later stage
artifacts, prints the absolute run directory, and fails clearly when the run
already exists. A destructive `--force` or equivalent reset flag is deferred
unless implementation proves it is needed for v0.

Minimum decision commands:

```text
yoinkit map-gate <run-dir> --approve [--note "..."]
yoinkit map-gate <run-dir> --reject --reason "..."
yoinkit map-gate <run-dir> --approve-exception <exception-id> --reason "..." --scope <kind:id>
```

Approving an exception is not the same as approving the gate. `--approve-exception`
records that specific exception approval and rewrites the gate decision record,
but the gate remains failing until every required assertion and coverage blocker
has passed, been marked out of scope, or been approved as an exception. Final
gate approval still requires `--approve`.
When the exception id already exists in `page-model.json`, the command marks it
approved. When it does not exist, the command creates it and requires enough
context: `--reason`, `--scope <kind:id>`, and optional `--expires-after-stage`.

`--reject` requires a human-readable reason and writes it to
`04-map-report/gate.json`.

`--approve` may include an optional `--note`. Approval notes are audit context in
`gate.json`; they do not update `page-model.json` unless they change canonical
model facts.

## Stage Spine

```text
Recon -> Static Map -> Motion Scout -> Map Report -> Map Gate -> Capture -> Spec -> Implement
```

The agent may run deterministic helper commands inside a stage. It must not cross
a gate boundary until the gate passes or the human explicitly approves a recorded
exception.

Stage commands are idempotent within their artifact ownership. Re-running a
stage may overwrite that stage's directory and the portions of `page-model.json`
owned by the stage, but it must not delete unrelated stage directories or later
human Notes, exceptions, Capture data, Spec data, or implementation status unless
the user explicitly invokes a future destructive reset.

Any upstream stage rerun that changes `page-model.json`, assertions, coverage, or
motion candidates makes the existing Map Gate decision stale. The runner may keep
the old `04-map-report/gate.json` as an audit artifact, but it must mark or
supersede it. A later `map-gate --approve` requires a fresh `map-report`.

`yoink` and `implement` are separate visible skills. A convenience handoff may
start `implement` after `yoink` produces Report + Spec, but implementation still
runs as a separate build context.

## Dependency-Aware Gates

Gates block only the downstream stages that depend on the missing evidence.
Stages may proceed when their prerequisites are met, as long as lower-confidence
items and gaps are carried forward honestly.

- The **Map Gate** is required before Capture and Implement because both depend
  on spatial/static truth.
- Full Capture completeness is required before claiming the yoink complete, but
  it is not required before starting an implementation draft.
- `implement` may start after the Map Gate passes. It consumes measured motion
  tightly, carries `verify` motion as loose/human-review work, and records gaps
  instead of inventing certainty.
- If Capture completeness has not been approved, `implement` produces a
  **draft implementation**. Once Capture is approved complete, or once the
  remaining verify items and gaps are resolved enough for final review, the build
  can become a **candidate implementation**.

## Evidence Rules

Every claim that affects a gate must carry evidence.

- Static facts come from DOM, CSSOM, computed styles, screenshots, crops, or
  downloaded bytes.
- Motion facts come from the capture engine's sampled frames, event stream,
  library registry, Clips, or explicit human Notes.
- Human judgment belongs in Notes, importance, gate approval, and exceptions.
  It must not replace measured mechanics.
- Unknowns are recorded as `null + reason`. They are never silently dropped and
  never invented from memory.
- When sources conflict, prefer measured runtime facts over screenshots, and
  prefer source-like visual evidence only as supporting context.

## Recon Stage

Recon proves the source page can be reached and described at the configured
viewports before any Page model structure is authored.

Recon uses the repo browser wrapper for consistent page driving, but it does not
require a headed, visible browser. It may run headless because it records
reachability, readiness, dimensions, iframe facts, and metadata, not motion.
Headed capture remains a Capture and observe-mode requirement.

Map workbench network access is single-page scoped. Recon loads the target page
and the resources that page naturally requests. Static Map may fetch discovered
assets for evidence. The first slice must not add sitemap traversal, unrelated
crawling, or external API lookups.

Recon must write:

- `01-recon/page-state.json`
- `01-recon/viewport-manifest.json`
- `01-recon/source-metadata.json`

Recon records at least:

- final URL after redirects
- readiness and blocker status
- viewport dimensions actually used
- page dimensions per viewport
- title and source metadata
- framework and library hints where detectable
- dominant iframe facts, including same-origin retargeting or cross-origin
  blockers
- scroll and lazy-load readiness notes

Source metadata includes visible page metadata such as title, meta description,
canonical URL, Open Graph image, and robots meta when present. Recon records
these facts but does not interpret legal permission or robots policy in v0.

When a same-origin iframe is clearly the dominant page content, Recon retargets
the run to that iframe document, records `retargetedFrom` in
`01-recon/page-state.json` and `page-model.json`, and downstream stages operate
on the iframe URL. When the dominant iframe is cross-origin, Recon records a
blocking fact with the iframe URL; the human or agent must start a new run
against that URL rather than silently mapping the shell page.

Recon may update canonical page-level facts in `page-model.json`: final source
URL, measured viewports, page dimensions per viewport, and source metadata needed
by downstream stages. The `01-recon/*` artifacts remain the evidence. Recon must
not create Regions, Region placeholders, motion candidates, Notes, or exceptions.

Recon must not create Regions, Region placeholders, or motion candidates. Those
begin in Static Map and Motion Scout.

`recon` is done when tests or fixture smoke prove it writes
`01-recon/page-state.json`, `01-recon/viewport-manifest.json`, and
`01-recon/source-metadata.json`; updates only page-level facts in
`page-model.json`; records readiness, final URL, dimensions per measured
viewport, source metadata, iframe facts, and blocker status; handles same-origin
iframe retargeting and cross-origin iframe blocking; exits non-zero on real
blockers; and does not create Regions or motion candidates.

## Map Stage

Map builds the Page model skeleton through two pre-human passes:

- **Static Map** proves the static scaffold: Region identity, boxes, layout,
  colors, typography, assets, and Region placeholder shape and size.
- **Motion Scout** discovers likely motion targets from registries, CSS
  transitions, keyframes, split reveals, hover affordances, loops, and scroll
  triggers. It writes candidates for Capture; it does not write measured motion
  facts.

Map is place-first: Regions are ordered top-to-bottom, with captures nested later
inside their spatial home.

Static Map is YoinkIt's extraction-equivalent layer: it records measured
per-Region facts. It must not synthesize global design tokens, infer component
architecture, or decide how the implementation should be decomposed. Those
decisions belong to `implement`.

`page-model.json` stores canonical Region facts and compact evidence references.
Full raw Static Map measurements live in `02-static-map/measurements.json`; the
Page model must not become a dump of every sampled computed style or DOM fact.

Static Map v0 produces section-level visual Regions: header/nav, hero, major
content bands, repeated-list containers, and footer, ordered top-to-bottom. It
must not create a Region for every DOM node, hover target, animation target, or
future implementation component. It may create a smaller Region when a distinct
visible area would otherwise be impossible to review or capture, such as a
modal, carousel panel, or isolated sticky/pinned area.

Static Map v0 authors Regions automatically from semantic and layout evidence:
landmarks such as `main`, `section`, `header`, `footer`, `article`, and `nav`;
large visible layout bands; sticky or pinned areas; visible text clusters; and
major media or repeated-list blocks. Human-drawn Focus areas are not required for
Map v0; they remain later overrides or observe gestures.
Static Map may record minimal accessibility facts that help Region naming and
selector confidence, such as landmarks, roles, and ARIA labels. It does not run
a full accessibility audit in Map workbench v0.

Static Map should aggressively merge tiny adjacent candidates into the nearest
meaningful visual band. Keep separate Regions for sticky or pinned areas,
modals/overlays, or distinct interaction surfaces that would be impossible to
review inside the parent. A typical landing-page v0 Report should read like a
page outline, often around 5-15 Regions rather than dozens of DOM fragments.
Sticky or persistent UI, such as a nav/header, gets its own Region with its own
rect and presence facts even when it overlaps another Region. The Report should
show the overlap honestly.
`order` is top-to-bottom reading and scroll order for lists and handoff. Visual
overlap uses separate per-viewport stacking facts, such as z-index or stacking
notes when known. Do not overload `order` to mean z-order.

Regions are a flat ordered list in v0. Each Region may include `parentId: null`
and a coarse `kind` to leave room for future hierarchy, but the Report and Map
Gate must not require nested Region semantics in the first workbench slice.
Region `kind` is a small coarse enum in v0: `header`, `nav`, `hero`, `section`,
`list`, `media`, `sticky`, `overlay`, `footer`, or `unknown`. It helps naming and
reporting; it is not implementation component taxonomy.

Region ids are deterministic, human-readable slugs prefixed with `region-`, such
as `region-header`, `region-hero`, `region-work`, and `region-footer`.
Duplicates are suffixed by order, such as `region-feature-2`. Region ids must not
include viewport ids, selector hashes, generated Webflow node ids, or DOM depth.
Selectors remain evidence, not identity.

Region names should be meaningful when possible, inferred from landmark role,
ARIA label, heading text, nav/footer semantics, or dominant section text. Fall
back to positional names such as `Section 3` only when no meaningful label exists.
Names are part of the capture and implementation handoff and are reviewed at the
Map Gate.

Region source evidence stores both `primarySelector` and `selectors[]`.
`primarySelector` is the best stable selector for reruns and crops; `selectors[]`
records supporting selector evidence. If no stable primary selector exists, store
`primarySelector: null` with a reason rather than inventing one.
Generated ids such as Webflow `#w-node-*` must not drive Region identity and
should be avoided as `primarySelector` when a better selector exists, but they may
appear in `selectors[]` as supporting evidence.

Static Map v0 attempts a crop for every present Region at every measured
viewport. The Region stores either a crop path or `null + reason`. A missing crop
does not delete the Region, but it is a required Map Gate item unless marked out
of scope or approved as an exception.

Static Map v0 downloads same-origin assets for every present Region when they
are safely fetchable, stores them under `02-static-map/assets/`, and records
hashes, dimensions, paths, errors, or `null + reason`. Unsafe sources are
skipped by default, loudly and non-blockingly: `file:` assets are not read, and
cross-origin assets are not fetched. Skipped evidence uses `status: "skipped"`
with a reason, `gateImpact: "non-blocking"`, and a recovery flag. Missing
same-origin required assets still block the Map Gate. Crops remain required
because they prove what rendered even when source assets were not copied.

Trusted overrides must be explicit. `--allow-file-assets --file-asset-root <dir>`
allows local files only inside a trusted root after realpath, symlink escape,
directory, size, and asset-type checks. `--fetch-public-cross-origin-assets`
allows public HTTPS cross-origin fetches without browser credentials after DNS,
private-address, redirect-target, timeout, redirect-count, and size checks.
`--strict-skipped-assets` makes skipped required assets block instead of staying
informational. Static Map flags are persisted into `00-config.json` before the
stage runs so reruns are reproducible.

These downloaded assets are evidence for judging visual balance and building the
first prototype; they are not implementation tokens or a permanent promise to
reuse source bytes. The browser probe identifies asset URLs and use context.
Node-side stage code downloads assets, writes files, records hashes/paths/errors,
and stores `null + reason` or `skipped + reason` when a download is not
available. Missing decorative, vendor, offscreen, or crop-covered assets are
info items or exception candidates, not blanket blockers.

Static Map v0 records typography facts, including font family, size, weight,
line-height, letter spacing, and source stylesheet or font URLs where
discoverable. It does not have to download font files unless that falls out of
the asset fetcher safely. Missing font bytes are an info item or exception
candidate in v0, not a default Map Gate blocker.

Static Map records responsive `presence` and visible or resting geometry. Hidden
or offscreen animation start states belong to Motion Scout candidates or later
Capture facts unless they affect static layout or responsive presence. Static
Map must not infer motion states such as "starts at opacity 0" as static facts.

Static Map v0 uses a place-first page-side probe for Region extraction. It must
not force the existing `window.__cap.map()` capability-first output to act as the
Region model. Motion Scout may reuse existing engine map probes for library,
registry, CSS, and motion-clue discovery.
The Static Map Region probe is runner-owned in v0, not part of
`extension/capture-animation.js`. It may move into a shared engine API later if
the shape proves stable, but the capture engine should not absorb Region
extraction before that boundary is proven.
Store runner-owned page probes as standalone files, for example under
`lib/probes/`, and inject their contents from the relevant stage. Avoid large
page-probe template strings inside stage modules.
Motion Scout should start by calling `window.__cap.map()` plus small runner-owned
helpers for place attachment and deduplication. Give Motion Scout its own
standalone probe only after those helpers become substantial.
The Static Map browser probe returns raw measured Region candidates and evidence.
Node-side stage code owns normalization, merging, naming, id assignment, artifact
writing, and assertions. Browser code measures DOM and layout; Node code owns
product rules and Page model shaping.

Recon records readiness and lazy-load notes as page facts. Static Map may perform
deterministic settling needed for measurement, such as scrolling through the page
once to reveal lazy assets and returning to measurement positions. Static Map
records any settling recipe in `02-static-map/measurements.json` so crops and
assets are explainable.
Settling should load assets without intentionally capturing transient motion
states. After scrolling back, Static Map waits for a resting state before taking
crops. If a crop is taken in a non-resting or unavoidable scroll-triggered state,
record that fact and mark the Region or crop for verify or exception review at
the Map Gate.

Static Map `static.colors`, `static.typography`, and `static.assets` are evidence
lists, not tokenized design-system fields. They record measured values, selectors,
asset paths, intrinsic dimensions, and evidence methods. They must not contain
implementation tokens such as `--color-primary` or component names such as
`HeroTitle`.

`static-map` is done when browser-backed fixture tests prove it creates a
section-level flat Region list; stable ids, names, and kinds; per-viewport rect,
presence, scroll, and stacking facts; crops or `null + reason`; asset and
typography evidence; `02-static-map/measurements.json`;
`02-static-map/assertions.json`; `02-static-map/coverage.md`; and updates only
Static Map-owned Page model fields. It must not create motion candidates or
implementation tokens.

Motion Scout writes candidates in two shapes:

- `03-motion-scout/motion-candidates.json` is the flat runnable checklist for
  Capture.
- `page-model.json` stores Region-local candidate references by id so the Report
  can show each candidate in its spatial home without duplicating the full
  candidate object.

`03-motion-scout/motion-candidates.json` also records discovery coverage under
`discovery.inspections[]`. Each row represents one discovery source at one
measured viewport, with `source`, `viewportId`, `required`, `status`, candidate
count, evidence, and an optional reason. Required v0 sources are
`css-transition-hover`, `hover-affordance`, `css-keyframes`,
`css-keyframes-loop`, `split-reveal-dom`, `scroll-trigger-registry`,
`sticky-pinned-clue`, `click-affordance`, and `cursor-affordance`.
`unknown-motion-clue` is not a required source.

Motion candidates are leads, not measurements. They may record a likely trigger,
source selector, Region id, and evidence source. They must not record measured
duration, easing, from/to values, or frame timelines.

Motion candidate ids use a `candidate-` prefix. They must not use `capture-`
ids, because Capture has not measured them yet. Later Capture stages may promote
or reference a candidate when creating real capture pass ids.
Candidate ids should be best-effort stable across reruns, derived from Region id,
trigger, and a normalized selector or mechanism slug, with suffixes for
collisions. If the Region id and evidence signature survive, the candidate id
should survive; if segmentation changes, perfect stability is not promised.

Motion candidates may include a suggested recipe skeleton for later Capture:
likely trigger, target selector, precondition such as `scroll-into-view`,
estimated wait window, reason, evidence reference, and `confidence: "candidate"`.
They must not be treated as final Capture manifests or measured timing facts.
Candidate `trigger` uses a small v0 enum: `hover`, `click`, `scroll`, `load`,
`loop`, `cursor`, or `unknown`. Use `unknown + reason` when evidence is unclear.
CSS infinite animations and marquees use `trigger: "loop"` rather than `load` so
ongoing motion does not get conflated with entrance reveals.
Cursor-follow and magnetic effects use `trigger: "cursor"` rather than `hover`;
ordinary hover state changes use `hover`.
Candidates include simple viewport applicability. Use `all` only when evidence
exists across all measured viewports or when only one viewport is measured.
Otherwise record the viewport ids where the candidate was discovered, such as
`viewports: ["desktop"]`, and let later human review or Capture broaden it.

Motion Scout may assign mechanical `priorityHint` values for work ordering, based
on signals such as source type, interaction type, Region kind, selector stability,
evidence count, and likely visibility. It must not assign Signature or polish
judgment such as `importance: "signature"`. Importance belongs to the agent and
human through Notes and Report review.

Motion Scout deduplicates candidates globally by evidence signature while keeping
Region-local references. Repeated behavior, such as the same hover pattern across
many cards, may be represented by one candidate with `occurrences[]`; each
affected Region references the candidate id so Report coverage remains spatial.

Motion Scout uses both static inspection and safe runtime-readable probes. Static
sources include CSS transitions, CSS keyframes, split reveal DOM, hover
affordances, sticky or pinned layout clues, loops, cursor affordances, and click
affordances. Runtime-readable sources include existing engine map probes such as
GSAP and ScrollTrigger registries. These sources discover likely targets only;
they do not turn candidates into measured motion facts.

Motion Scout attaches candidates to existing Regions. It must not silently split
or reshape Static Map segmentation. If it finds a motion source outside every
Region, it records a required Static Map coverage failure or a candidate with
`regionId: null + reason`. The exception is a distinct overlay, sticky area, or
pinned surface that Static Map demonstrably missed; Motion Scout may request or
create that Region with evidence, and the change must be visible as a Map Gate
item.

`motion-scout` is done when fixture tests prove it uses Static Map Regions; calls
engine map and runtime-readable clues where available; writes deduplicated
`candidate-*` records to `03-motion-scout/motion-candidates.json`; writes
`03-motion-scout/assertions.json` and `03-motion-scout/coverage.md`; stores only
Region-local candidate references in `page-model.json`; records viewport
applicability; uses the trigger enum correctly; assigns mechanical
`priorityHint`; and never records measured duration, easing, from/to values, or
frame timelines.

Map must write:

- `page-model.json`
- `02-static-map/measurements.json`
- `02-static-map/assertions.json`
- `02-static-map/coverage.md`
- `02-static-map/crops/`
- `03-motion-scout/motion-candidates.json`
- `03-motion-scout/assertions.json`
- `03-motion-scout/coverage.md`
- `04-map-report/index.html` as Report v0

`02-static-map/coverage.md` is the human-readable checklist for Static Map
coverage. `02-static-map/assertions.json` is the machine-readable gate input
that `map-gate` evaluates. They cover the same Map facts from different angles:
human scan versus deterministic validation.

`03-motion-scout/coverage.md` and `03-motion-scout/assertions.json` follow the
same split for candidate discovery. They answer whether Motion Scout inspected
the obvious motion sources before human review: registries, CSS transitions,
CSS keyframes, split reveals, hover affordances, loops, and scroll-trigger
sources. They gate discovery coverage, not motion fidelity. `complete` means the
source was inspected for that viewport, even when it found zero candidates.
`missing` blocks the Map Gate when the source was not inspected or could not be
inspected. `out_of_scope` must carry an explicit reason. `info` is only
non-blocking context and is not a substitute for required coverage.

Coverage Markdown and assertion JSON are generated from a shared in-memory model.
Markdown is optimized for human scanning; JSON is optimized for deterministic
gate evaluation. They must not be separately hand-authored projections that can
drift.

Coverage rows include:

- area
- whether it is required
- status
- evidence
- reason when missing, out of scope, or exceptional

Assertion rows include:

- stable id
- kind
- required flag
- status
- evidence references
- failure or exception reference when applicable

Static Map assertion kinds include Region geometry, placeholders, per-viewport
crops, Region assets, Region typography, unknowns, and Region evidence
completeness. Unknown rows can be informational; required completeness rows fail
only when required evidence is missing.

Each Region must have:

- stable id
- human-readable name
- order within the page
- per-viewport rect and scroll-Y
- per-viewport presence
- Region placeholder dimensions derived from the measured Region rect
- crop path or `null + reason`
- static visual evidence where available
- source selectors or `null + reason`
- motion candidates or an empty list

Minimum Region v0 shape:

```json
{
  "id": "region-hero",
  "name": "Hero",
  "kind": "section",
  "parentId": null,
  "order": 1,
  "viewports": {
    "desktop": {
      "presence": "present",
      "rect": { "x": 0, "y": 0, "width": 1280, "height": 760 },
      "stacking": { "zIndex": "auto" },
      "scrollY": 0,
      "placeholder": { "width": 1280, "height": 760 },
      "crop": {
        "path": "02-static-map/crops/desktop/region-hero.png",
        "width": 1280,
        "height": 760,
        "bytes": 12345,
        "selector": "main > section.hero",
        "method": "agent-browser-selector-screenshot"
      }
    }
  },
  "static": {
    "colors": [],
    "typography": [
      {
        "selector": "h1",
        "sampleText": "Launch faster",
        "fontFamily": "Inter, sans-serif",
        "fontSize": "64px",
        "fontWeight": "700",
        "lineHeight": "72px",
        "letterSpacing": "-1px",
        "sourceHints": {
          "stylesheetHrefs": ["https://example.com/site.css"],
          "fontUrls": ["https://example.com/fonts/inter.woff2"]
        },
        "missing": []
      }
    ],
    "assets": [
      {
        "selector": "img.hero-art",
        "kind": "img",
        "url": "https://example.com/assets/hero.png",
        "path": "02-static-map/assets/region-hero/hero.png",
        "status": "fetched",
        "sha256": "hash",
        "bytes": 12345,
        "dimensions": { "width": 640, "height": 360 },
        "required": true,
        "severity": "required",
        "gateImpact": "satisfied"
      },
      {
        "selector": ".vendor-pixel",
        "kind": "img",
        "url": "https://vendor.example/pixel.gif",
        "path": null,
        "status": "skipped",
        "reason": "cross-origin asset fetch disabled by default",
        "required": false,
        "severity": "info",
        "gateImpact": "non-blocking",
        "recovery": { "flag": "--fetch-public-cross-origin-assets" }
      }
    ],
    "layout": {}
  },
  "source": {
    "primarySelector": "main > section.hero",
    "selectors": ["main > section.hero"],
    "evidence": []
  },
  "motionCandidates": [{ "id": "candidate-hero-hover" }],
  "unknowns": []
}
```

The Region id is the stable identity across viewports. Presence, rect, scroll-Y,
placeholder dimensions, and crop are per-viewport facts.

## Map Gate

The Map Gate is binary. It passes only when all of the following are true:

- Report v0 exists and is current for the relevant Page model, assertion, and
  coverage inputs
- every required Map assertion passes
- every required Static Map coverage row is complete
- every required Motion Scout coverage row is complete
- every unknown has `null + reason`
- every exception is explicitly human-approved and recorded
- the human approves Report v0

Canonical exceptions live in `page-model.json` under `exceptions[]` so Capture,
Spec, and Implement inherit them automatically. `04-map-report/gate.json` is the
Map Gate decision record: it records the gate result, assertion summary, coverage
summary, unknowns, human approval, and the ids of approved exceptions. It does
not own a second copy of the exceptions.

Canonical exceptions include at least `id`, `stage`, `scope`, `reason`,
`approvedBy: "human"`, and `approvedAt`, plus optional `approver` free text and
optional `expiresAfterStage` when the exception should be revisited downstream.
Map Gate exceptions use `stage: "map-gate"`. V0 does not invent identity or auth;
the important fact is that the exception was not agent-silenced.

`map-gate` must fail an approval when required assertions fail or coverage rows
are incomplete unless each blocking item has already been marked out of scope by
the producer or waived by a canonical human-approved exception in
`page-model.json`. Coverage statuses such as `approved` and `exception` are not
canonical waivers and must not pass the gate. A Region-scoped Map Gate exception
uses `scope: { "kind": "region", "id": "<region-id>" }`; the id must resolve to
a real Page model Region, and the approved exception waives required blockers
whose target resolves to that Region. The command records explicit approval or
rejection; it does not infer either from the Report.

Because the human approves the Report, `map-gate --approve` must fail when
`04-map-report/index.html` is missing or stale relative to `page-model.json` and
the assertion or coverage inputs. V0 may use simple hashes or mtimes; the
required recovery is to rerun `map-report`.

Map Gate can pass with zero motion candidates when Motion Scout completed its
discovery checklist and found no applicable motion sources. It cannot pass when
Motion Scout simply failed to inspect required sources such as CSS transitions,
keyframes, hover affordances, registries, loops, or scroll-trigger clues.
When a run measures multiple viewports, Map Gate requires Static Map coverage for
Region presence, geometry, crops, and placeholders across all requested
viewports. It does not require the same motion candidates to exist on every
viewport; it requires Motion Scout discovery coverage to have run for each
measured viewport or to be explicitly scoped.

Map assertions cover at least:

- important visible sections are represented as Regions
- Region rects match the source within the configured tolerance
- Report v0 Region placeholders match the measured Region dimensions
- crops align with the source Region
- scroll order is correct
- responsive presence is correct for the mapped viewports
- Region names are stable enough for capture and implementation handoff
- Motion Scout candidates are recorded as candidates, not measured motion facts

Map workbench v0 uses a default `2px` tolerance for Region `x`, `y`, `width`,
and `height` consistency checks unless configured otherwise. Because Static Map
is producing the measured facts, these assertions primarily compare
`02-static-map/measurements.json`, `page-model.json`, crop bounds, and Report
placeholder dimensions; they are not an external visual diff.

There are no agent-controlled warnings. A finding is one of:

- **Required assertion failure**: blocks the gate.
- **Out of scope**: excluded before the gate with a reason.
- **Human-approved exception**: allowed only when recorded in the Page model and
  the gate artifact.
- **Info**: visible note only, not part of the gate.

Use `unknown` only when the system expected a factual value but could not
determine it; store the field as `null` with a reason. Use `out_of_scope` only
when the human or agent deliberately excludes something before the gate. Use
`info` for non-blocking observations.

The agent may propose `out_of_scope` with a reason. Required out-of-scope
exclusions need human approval in the Map Gate decision, so they do not become a
quieter form of exception.
Map workbench v0 does not need a separate CLI command for marking out-of-scope
items. Use `out_of_scope` as an assertion or coverage status when produced by a
stage, and use exceptions when a required item needs explicit human approval to
proceed.

`map-gate` is done when tests prove it evaluates required Static Map and Motion
Scout assertions and coverage; checks Report freshness; fails approval on
blockers; records rejection with a required reason; records or creates exception
approvals with required scope and reason; keeps exceptions canonical in
`page-model.json`; writes schema-versioned `04-map-report/gate.json` with input
hashes, summaries, and notes; treats exception approval as separate from final
approval; and never decides approval itself.

## Report

The Report is the human-facing projection of the Page model. It is written to
disk and opened in a browser. It does not re-enter agent context unless the human
or agent explicitly reads a small part of it.

Report v0 is a static self-contained HTML file with embedded CSS and JavaScript
for view-mode toggles and local interactions. It has no dev server, build step,
or frontend framework. It reads `page-model.json` and stage artifacts at
generation time and writes `04-map-report/index.html`. Direct Report edits that
write back to `page-model.json` may be deferred in v0; assessment and gate review
come first.

The generated Report embeds the Page model projection, relevant assertion and
coverage snapshots, and input freshness hashes directly in `index.html`, while
linking crops and assets by relative path. `page-model.json` remains the source
of truth; the embedded data is the Report projection at generation time.
`map-report` also writes the same structured projection to
`04-map-report/report-snapshot.json` so downstream tools can read it without
scraping HTML.
Dependencies and a Vite-style dev harness are allowed for authoring the Report
renderer if they make development easier, but `map-report` must still emit a
portable static artifact that can be opened without a running server.
The first implementation slice does not have to add Vite; it should start with
the simplest renderer that satisfies Report v0 and add authoring tooling only
when it clearly pays for itself.

The product direction remains that Report edits eventually write back to the
Page model. For the first Map workbench slice, Report v0 may be read-only except
for gate decisions recorded through `map-gate`.

`map-report` does not open a browser by default. It writes
`04-map-report/index.html` and prints the absolute path, and may also print a
`file://` URL. Auto-opening is the skill layer's responsibility or a future
explicit flag.

Report v0 must support three view modes:

- **Source mode**: Region crops placed first in a scroll-accurate scaffold,
  exact Region positions, correctly sized Region placeholders, and minimal debug
  overlay. Measured colors, typography, and assets are fallbacks when crops are
  missing, not a page reconstruction engine. It answers whether the static
  scaffold resembles the source.
  Full-page stitched screenshots are not required in Report v0.
- **Region mode**: artificial tints, inset non-layout-affecting borders, labels,
  hover outlines, and tooltips. It answers whether segmentation is correct.
- **Gate mode**: missing, uncertain, failed, or blocking items emphasized. For
  Report v0, this includes failed assertions, incomplete coverage rows, unknowns,
  unapproved exceptions, and motion candidates that need human attention. It
  answers what blocks Capture.

`map-report` is done when tests prove it generates
`04-map-report/index.html` from the current Page model, assertion, coverage, and
candidate artifacts; embeds snapshot data and input hashes; links crops and
assets relatively; supports Source, Region, and Gate modes without a server;
renders Region placeholders from Page model geometry only; surfaces missing,
failed, unknown, exception, and candidate items in Gate mode; prints the absolute
path; and does not open a browser by default.

Post-v0, edits made through the Report write back to `page-model.json`. They do
not decorate the HTML only.

After `implement` runs, the Report also shows implementation status per Region
and per motion item. It should surface at least:

- Map status
- Capture status and Confidence
- Static Fidelity assertion status
- motion assertion status
- open verify items
- gaps and human-approved exceptions
- draft or candidate implementation state

The Report is also a re-entry point. A follow-up command may resume from the run
or Report path and start an Improve pass focused on the current failures and
gaps, rather than restarting the whole yoink.

The visible command for this is:

```text
implement --improve <run-dir>
```

## Capture Stage

Capture enriches Regions in the Page model. It runs in automated mode and observe
mode. A capture pass writes an isolated pass directory, then the agent merges the
pass into `page-model.json`.

Each pass must record:

- mode: `automated` or `observe`
- viewport
- Region ids touched
- Trigger evidence where measured
- captured motion items
- Confidence per item
- Clips and crop paths
- Notes
- unknowns as `null + reason`

Trigger mechanics are measured. Notes carry human intent, not mechanical facts
the engine can measure.

## Spec

`06-spec/spec.json` is the machine-facing projection of `page-model.json`. It is
compact and agent-ingestable. It references Clip paths but does not inline
frames.

The Spec must preserve:

- Region identity and viewport applicability
- Static Fidelity facts needed by implementation
- measured motion facts
- Confidence
- human Notes that affect implementation judgment
- recorded exceptions

## Implement Stage

`implement` consumes `06-spec/spec.json` first. The Report and Clips are
supporting evidence. The implementation skill inherits clone-app's build rigor
where it does not conflict with YoinkIt.

The default `implement.targetStack` is `house`: React, Bun, Vite, Lenis, GSAP,
and CSS Modules. Lenis is default-on: calibrate it toward measured source smooth
scroll behavior when evidence exists, otherwise use the House Lenis settings.
Disable it only by explicit config override or human-approved exception. A
project may override the stack explicitly, for example to target Astro.

CSS-authored motion stays CSS when it can be ported cleanly and faithfully:
transitions, keyframes, and simple local animations should not be rewritten into
GSAP for ceremony. GSAP is the default for Signature motion that needs an
animation runtime: choreography, scroll-triggered motion, timelines, staged
reveals, and complex hover sequences. Do not choose Framer Motion, Anime.js, or
source-site motion libraries unless the config explicitly overrides the House
stack.

The source site's framework is evidence about the source, not an implementation
target.

Required shape:

- permanent implement references inside this repo define the standard House
  architecture and build rules
- run a minimal per-run Architecture stage before build work starts
- the Architecture stage writes `07-implement/architecture/file-tree.md`,
  `07-implement/architecture/component-map.md`,
  `07-implement/architecture/motion-map.md`, and
  `07-implement/architecture/token-map.md`
- the Architecture/Foundation work extracts an editable implementation token
  layer from the Spec, covering color, typography, spacing, assets, and motion
  variables where evidence supports them
- the built app exposes the implementation token layer through the House stack's
  normal control surface, such as global CSS custom properties and motion
  variables, instead of scattering hard-coded values through components
- document the generated file tree before implementation work fans out
- build foundation first: tokens, layout shell, assets, shared components
- build pages or sections after the foundation
- use CSS Modules for component styling, layout rules, responsive rules, state
  selectors, and local animation classes
- use global CSS variables for tokens and House stack variables
- use inline styles only for dynamic runtime values or assigning CSS custom
  properties such as measured delays
- keep static visual assertions tight
- keep motion assertions confidence-aware
- keep code architecture clean and remixable
- keep compile, lint, and test checks green where available

Implementation gates are tiered:

- **Static Fidelity gate**: strict measured assertions for layout, colors,
  typography, assets, states, responsive geometry, and key dimensions.
- **Motion gate**: measured spec diff where confident, looser verify path where
  confidence is lower, with Clips and human judgment as supporting evidence.
- **Architecture gate**: clean idiomatic components, clear props, no source
  framework or source architecture fidelity.
- **Build gate**: the target project compiles, and configured lint/tests pass.

## Improve Pass

An Improve pass starts from an existing run directory. The agent reads
`page-model.json`, `06-spec/spec.json`, implementation QA artifacts, and the
Report status, then works with the human to choose the next focused target.

Valid targets include:

- fix static assertion failures
- implement or improve a measured motion
- resolve a `verify` motion item
- run another capture pass for a gap
- update a human-approved exception
- promote a draft implementation to candidate

The pass must preserve the same evidence rules and update the Page model, Report,
Spec, and implementation QA artifacts as appropriate.

## Terminal States

Each major stage ends in one of these states:

- `PASS`: the gate passed.
- `BLOCKED`: an external or missing-input condition prevents honest progress.
- `STUCK`: repeated attempts do not improve the measured failure count.
- `CEILING`: the configured attempt budget was reached.

On failure states, write an escalation artifact with:

- stage
- failed assertions or incomplete coverage rows
- unknowns
- exceptions requested but not approved
- attempts made
- recommended next action

## Human Check-Ins

Human check-ins are hard stops at gate boundaries. The user can approve, revise,
record an exception, or stop. The agent must not continue past a gate while
required assertions fail or unapproved exceptions remain.
