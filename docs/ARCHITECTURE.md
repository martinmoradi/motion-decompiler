# YoinkIt — Architecture (product design of record)

This is the product-level north star: what YoinkIt is for, the unit of work, the
pipeline shape, and how a yoink converges. It sits above the procedural run
contract in [CONTRACT.md](./CONTRACT.md). Vocabulary used here is defined in
[CONTEXT.md](../CONTEXT.md). Hard decisions behind it are recorded in
[docs/adr/](./adr/). Historical pre-Map-workbench specs and roadmaps are archived
under [docs/archive/legacy-capture-pipeline/](./archive/legacy-capture-pipeline/).

## What YoinkIt is for

YoinkIt exists to **clone-and-modify high-end frontend craft instead of inventing
from a blank page.** There is one spine and one forcing function:

- **B (the spine): deliver client prototypes fast.** Real client, real deadline,
  branding/design done by a non-designer. The strategy is clone-then-modify, not
  invent.
- **A (a quality bar on B, not a separate product): legibility.** A yoink's
  output has to be understandable enough that the human can modify it and learn
  from it. The recurring "the data is too cryptic to get value from" complaint is
  B failing its A bar.
- **C (the compounding payoff): a remixable library.** Every yoink deposits a
  "premium LEGO" — a clean, decomposed motion you can recombine later. C accretes
  for free *if* B's output is clean and legible. It is not a thing to build now.

It is a cloner of experiences, not a source-code cloner. See
[ADR-0001](./adr/0001-clone-experience-not-source-code.md).

## The unit of work

A yoink is scoped to one of three units; scope is a knob, not a separate skill:

- **A — a motion.** "That shiny button — how?" Self-contained.
- **B — a section.** Tokens + the section's composed motions. A remixable start.
- **C — an experience.** The **Choreography**: scroll-triggered storytelling and
  page transitions. Not B×n — it is the connective tissue between the parts.

**First-client scope:** a single landing page, header-to-footer. Intra-page
scroll choreography is in; multi-page route transitions are out.

## The pipeline

One `yoink` pipeline, two capture modes, plus a separate downstream skill:

1. **Recon** — source reachability and orientation at the configured viewports:
   final URL, readiness, blockers, page dimensions, iframe facts, source
   metadata, and viewport manifest. It does not author Regions, Region
   placeholders, or motion candidates.
2. **Map** — two pre-human passes that build the legible, **place-first page
   model**:
   - **Static Map** — boxes, identity, layout, colors, typography, assets, and
     correctly sized Region placeholders. It proves the static scaffold before
     any back-and-forth. It records measured facts region-by-region; it does not
     synthesize a design system or implementation component model.
   - **Motion Scout** — likely hovers, reveals, loops, scroll triggers, split
     reveals, and registry/CSS motion clues. It produces capture candidates, not
     measured motion facts. It writes both a flat runnable checklist for Capture
     and Region-local candidate references for the Report.

   The result is an ordered list of [Region]s top-to-bottom, each with rect +
   scroll-Y + crop + human-readable name, with later captures (hovers, reveals,
   loops, scroll-triggers) nested *inside* the region they belong to. Cheap,
   headless. This is the referent captures attach to and the model the Report
   renders to scale; without it, captured IDs are floating signifiers. (The
   current engine emits a capability-first flat selector bag —
   `{ scrollTriggers[], hoverCandidates[], loops[], … }` — and will be rebuilt
   place-first.) Map ends with a **Map Gate**: the human approves the Report v0's
   Regions, correctly sized Region placeholders, rects, crops, scroll positions,
   responsive presence, names, Static Map coverage, and Motion Scout discovery
   coverage before Capture begins.
3. **Capture** — measure motion, attached to the map's named Regions. Two modes:
   - **Automated** — the agent drives known triggers (hover/scroll/click).
   - **Observe (human-guided)** — the human drives a real browser and the engine
     measures. The capture mode for the hard stuff automation misses
     (choreography, invisible hover zones, "the good bit"). See [the observe-mode
     spec](./specs/human-guided-observe-mode.md) and *Observe mode in practice*
     below.
4. **Report + Spec** — *two projections of one canonical [Page model]*, never
   authored in parallel. The Map builds the page model's skeleton, each capture
   pass enriches it, and the human annotates it through the Report. This
   single-source discipline (clone-app's `DESIGN.md`/`assertions.json` move) is
   what guarantees **no drift** between what the human sees and what the build
   agent ingests.
   - **Report** (human-facing render): a scroll-accurate HTML scaffold of the
     page, Region placeholders at real positions, captured motion/crops/
     verify-flags pinned where they happen. Region placeholder positions and
     dimensions are rendered from the Page model's Region geometry, not stored
     separately by the Report.
     For *assessment*. Accretes across passes; makes gaps visible. Zero context
     cost — it never re-enters an agent. Human edits
     (rename, importance, verify, note) write *back into* the page model. It has
     explicit view modes:
     - **Source mode** renders source-like evidence first: viewport-aligned
       Region screenshots where available, measured static visuals and tokens as
       fallbacks. It answers whether the visual evidence resembles the source.
     - **Region mode** adds artificial debug overlays: low-opacity tints, inset
       non-layout-affecting borders, hover outlines, labels, and tooltips with
       Region name, rect, scroll-Y, viewport presence, and gaps. The debug
       scaffold can scale down to fit the review pane while preserving measured
       pixel metadata. It answers whether segmentation is correct.
     - **Gate mode** emphasizes missing, uncertain, or blocking items for the
       current approval gate. For Report v0, it answers what blocks Capture.
   - **Spec** (machine-facing serialization): the compact JSON the build phase
     ingests. The only projection that re-enters context.

The downstream **`implement`** skill is a *separate context*: it reads the Spec
and builds clean running components. Kept separate so capture never bloats with
implementation. See [ADR-0002](./adr/0002-spec-report-separate-build.md).

## Delivery shape

YoinkIt is **agent-session-first**, with a deterministic workbench underneath.
The product brain lives in the agent session: deciding what to capture next,
guiding observe, judging gaps in the Report, stopping the capture loop, and
handing the Spec to `implement`. The workbench owns repeatable operations with
no taste or judgment: mapping, opening the observe browser, merging passes,
generating the Report, emitting the Spec, and managing run artifacts.

Both skill arguments and CLI flags compile into the same `00-config.json`. The
skill is the friendly product entrypoint, while the CLI is the deterministic way
to create, update, or execute the same run configuration. `implement` uses the
same config under its own section: `06-spec/spec.json` is the main
implementation input, while `00-config.json` carries operational settings like
output path, target stack, gate tolerances, and check-in policy.

The run shape follows clone-app's stage-directory discipline: numbered layers,
fixed artifact ownership, and explicit handoffs. YoinkIt borrows the artifact
rigor, not the exact clone-app stages:

```text
Recon -> Static Map -> Motion Scout -> Map Report -> Map Gate -> Capture -> Spec -> Implement
```

The CLI is a **stage runner**, not the product brain. Commands such as `init`,
`recon`, `static-map`, `motion-scout`, `map-report`, `map-review`, `map-gate`,
`capture`, `merge-pass`, `spec`, and `validate` perform repeatable work against
`00-config.json` and the run artifacts. They do not decide what is worth
capturing, whether a Report is good, or when the product has succeeded; those
judgment calls stay in the agent session and the human gates.

For the first Map slice, `yoinkit map <run-dir>` is only a convenience wrapper
for `recon -> static-map -> motion-scout -> map-report`. It stops before
`map-review` and `map-gate`; review opens the generated Report at the configured
viewport, while the gate command records the human-reviewed decision separately.

The existing `bin/yoinkit` is prototype material, not the architecture to
preserve. Reuse working browser-driving, artifact-writing, map/capture, and
repair-loop code where it fits the contract, but rebuild the CLI shape around
the Page model, Map Gate, Report view modes, and deterministic stage-runner
boundary.

There are two product-level agent skills:

- **`yoink`** — understand the source experience and produce Report + Spec.
- **`implement`** — consume the Spec and build clean running components.

Both are visible user-facing skills from day one. `yoink` may offer a convenience
handoff such as `--then-implement`, but that handoff still crosses the Report +
Spec boundary and starts `implement` as the build context rather than folding
implementation into capture.

Sub-agents, including a clip/video inspector, are internal helpers rather than
user-facing product entrypoints.

This keeps human and agent judgment in the layer that can reason about
Signature, while the deterministic layer stays boring, replayable, and useful
across agents.

## Borrowing from clone-app

YoinkIt should take as much of `clone-app-pat-pro`'s rigor as possible and relax
only where that rigor directly conflicts with YoinkIt's product. The reusable
parts are the contract shape: explicit stage inputs and outputs, fixed artifact
paths, evidence rules, anti-hallucination rules, binary gates, coverage
manifests, `null + reason` for unknowns, hard check-ins, and measured convergence
loops. The relaxed parts are only the pieces that conflict with YoinkIt's product:
source-code cloning, framework/library fidelity, source architecture fidelity,
and pretending motion can be pixel-diffed as if it were static layout.

## Implementation stack

YoinkIt has a default **House stack** so outputs compound into one reusable
library instead of scattering across whatever framework the source happened to
use. The default stack is:

- React
- Bun
- Vite
- Lenis
- GSAP
- CSS Modules

Lenis is default-on in the House stack. If the source has detectable smooth
scroll behavior, YoinkIt calibrates Lenis toward it; if not, it uses YoinkIt's
house Lenis settings. Disabling Lenis requires an explicit config override or a
human-approved exception because smooth scroll is part of the default premium
frontend baseline this product targets.

CSS-authored motion stays CSS when it can be ported cleanly and faithfully:
transitions, keyframes, and simple local animations should not be rewritten into
GSAP for ceremony. GSAP is the default for Signature motion that needs an
animation runtime: choreography, scroll-triggered motion, timelines, staged
reveals, and complex hover sequences. The implementation agent should not reach
for Framer Motion, Anime.js, or source-site motion libraries unless explicitly
overridden.

The House stack can be overridden explicitly in `00-config.json`, for example to
target Astro for a specific project. It is never inferred from or copied from the
source site.

Implementation output should have an explicit, documented file architecture
before code generation fans out. The implement skill has permanent references
for the standard House architecture, kept inside this repo for now because they
depend on YoinkIt terms like Region, Spec, Confidence, Clip, Static Fidelity, and
House stack. Each run has a minimal Architecture stage that writes
`file-tree.md`, `component-map.md`, `motion-map.md`, and `token-map.md` for the
current Spec. This is a guardrail against god files and mystery CSS, not an
invitation to over-design. CSS Modules are the default styling boundary:
component styling, responsive rules, state selectors, and local animation
classes live beside the component. Global CSS is for tokens and House stack shell
rules. Inline styles are reserved for dynamic runtime values or assigning CSS
custom properties such as measured delays.

Implementation extracts an **Implementation token layer** from the Spec during
the Architecture/Foundation work. Static Map stays factual and region-local; the
build turns those facts into editable color, typography, spacing, asset, and
motion variables, documented in `07-implement/architecture/token-map.md`, so the
human can toy with the final product without spelunking through component
internals. In the House stack, the built app exposes this control surface through
CSS custom properties and motion variables rather than scattered hard-coded
values.

Barba.js is a deferred candidate for inter-page transitions, not part of the
default stack yet. The first-client scope is one landing page, so this decision
waits until page transitions enter scope.

## Viewports, assets, and reconciliation

Responsive matters for a faithful landing-page baseline (layouts reflow, assets
get art-directed, some motions exist at only one breakpoint), but viewports
multiply work — so the cost asymmetry decides how, the same way it does
everywhere:

- **Map is multi-viewport.** Cheap and headless, so map structure + positions +
  crops + assets at each viewport the client needs (e.g. desktop/mobile). Full
  responsive baseline, clone-app parity.
- **Capture is primary-viewport-first.** Motion-capture is the expensive,
  ~⅓-reliable, human-driven third; tripling it is wasteful since signature motion
  is usually authored at desktop. Capture motion at the primary viewport, and add
  another viewport's motion *only where it genuinely differs* (a hamburger that
  only exists on mobile, a hover that becomes a tap).

**Reconciliation is a schema shape, not a phase:** the [Region] is the stable
spine across viewports. It carries per-viewport layout (rect, assets, presence),
and each motion attached to it carries a **viewport-applicability** tag (`all` by
default; `mobile-only`/`pointer-only`/… for exceptions). Build rule: per viewport,
render the regions present there with their per-viewport layout plus the motions
applicable there — deterministic, no build-time guessing. Applicability is
part-inferred by the Map and part-marked by the human in observe. See
[ADR-0003](./adr/0003-viewport-reconciliation.md).

**Assets** are a Map-phase concern (static, headless), not a Capture concern. For
the first client they are **bulk-fetched** so the prototype has real assets for
judging composition and visual balance — a deliberate, *revisable* deviation from
[ADR-0001](./adr/0001-clone-experience-not-source-code.md)'s "don't haul their
bytes," to be
narrowed to assets-the-motion-depends-on once the baseline workflow is proven.

## Two convergence loops, the Report is the handoff

- **Capture loop — human-gated completeness.** Passes accrete into the Report
  (automated, then observe, then scroll, …). The human decides when every element
  is there. Completeness is *signature judgment*, which is inherently human.
- **Build loop — machine-gated fidelity.** The build agent re-yoinks its own
  output and diffs the captured motion against the Spec. The engine that *creates*
  the spec is the *gate* that verifies the reproduction — a loop clone-app
  structurally cannot run for motion.

After implementation begins, the Report also accretes build status. It remains
the human-facing dashboard for the whole run: Map state, Capture confidence,
Static Fidelity assertions, motion assertions, gaps, exceptions, and draft vs
candidate implementation state. Follow-up work can start from that Report/run
state as an **Improve pass**, where the agent and human focus directly on the
highest-value failure or gap instead of replaying the full pipeline. The visible
command is `implement --improve <run-dir>`.

Gate tightness tracks each item's **Confidence**: `measured` items gate tight
(like clone-app's structural assertions); `verify` items get loose tolerance or a
human check. Driving the gate tighter than the spec's own confidence is chasing
measurement noise.

Gates are **dependency-aware**. The Map Gate must pass before Capture or
Implement because both depend on spatial/static truth. Full Capture completeness
is required before calling the yoink complete, but it does not have to block an
implementation draft; `implement` can start from a trusted Map plus whatever
motion evidence exists, carrying `verify` items and gaps forward honestly. A
build started before Capture completeness is a **draft implementation**; a build
from a Capture-approved Spec, or one whose gaps have been resolved enough for
final review, is a **candidate implementation**.

**The system's quality ceiling is set by capture quality, not build quality.** A
good spec converges easily under self-measurement; an uncertain spec cannot be
rescued by build-side measuring, because the build is hill-climbing toward the
wrong target. This is why the investment goes into capture quality and the
human observe loop — they raise the ceiling the build can reach.

## Fidelity gates by layer

YoinkIt uses **Static Fidelity** for the strict non-motion facts, and different
gates for motion and code architecture. Each layer has the tightest gate that
matches what can be measured honestly:

- **Map geometry is strict.** Region rects, scroll-Y positions, crops, assets,
  responsive presence, and static dimensions are measured as exact page facts.
  If these drift, every downstream artifact inherits the wrong spatial referent.
  The Map Gate makes this explicit before Capture starts: required assertions
  must pass, coverage checklist rows must be complete, unknowns must be recorded
  as `null + reason`, and any exception must be approved by the human and written
  into the Page model. Warnings do not silently pass the gate.
- **Static visual implementation is strict.** The build should inherit
  clone-app-style rigor for the foundation: fonts where available, colors,
  gradients, spacing, sizing, states, responsive geometry, and assets are checked
  with tight measured assertions. This denies the implementation agent creative
  freedom on fundamentals.
- **Motion implementation is measured but looser.** Measured motion gates tightly
  where the Spec is confident, while `verify` items use looser tolerances,
  Clips, and human judgment. Pixel-diffing clean remixes against the source is
  rejected as a false precision.
- **Code architecture is deliberately not source-faithful.** The build is judged
  by clean, idiomatic, remixable components, not by whether it copied the
  source's framework, libraries, DOM structure, or implementation architecture.

## Observe mode in practice

Observe mode is **human-driven and agent-async**. The engine (`window.__cap`,
injected into a real headed browser) does the recording locally — it is plain
page JavaScript, no AI, no tokens, instant. The agent is *not* live in the loop;
it processes the human's breadcrumbs afterward. The human is, in effect, shaping
the next handoff.

The surface is small:

- **Continuous recording** is cheap and bounded: an event log (categories only —
  `hover`/`wheel`/`click` + scroll position) plus a short ring buffer (~1.5s) so a
  mark can look *backward* (this is what solves first-frame loss). It does **not**
  mean sampling the whole page forever.
- **Two selection gestures**, one per axis: a **Focus area** (draw a box →
  authors a Region, engine samples motion inside it) and a **Corridor** (mark
  start→end along scroll → captures Choreography, keyed by progress).
- **Heavy per-frame sampling** runs *only* inside a focus area and *only* during a
  record burst — scoped in space, windowed in time. The firehose never exists.
- **One arm gesture** for page-lifecycle motion you can't catch reactively: arm →
  reload (load reveals, needed now — mammoth's hero races load) and arm → navigate
  (page transitions, deferred with inter-page C).
- **Trigger** is measured from the event stream, not declared. **Notes** carry
  only human intent the engine can't measure.

One **Pass** = select/record/annotate locally → finalize writes a compact
artifact + crops to disk → the agent merges it into the Page model and
regenerates the Report. Two levels of combining, both automatic: the engine
reduces a burst into per-Region captures; the agent merges artifacts across
passes. The human never hand-combines, and never streams a firehose to the agent.

A Pass also records a **Clip** per capture (cropped to the focus area, or the
viewport for a corridor) — a *second kind of evidence*, pixels alongside the
measured numbers. It lives on disk and the Report embeds it so the human can
*watch* the motion while assessing. For the build agent it is the visual
companion to low-`Confidence` captures **only**: frames are sampled on-demand,
and ideally by a **delegated sub-agent** that views them in its own context and
returns a compact text verdict — so the main build context never ingests pixels
for items the Spec already nails. Clips do not enable a tighter machine gate
(pixel-diffing a clean remix against the source is rejected); they feed agent
reasoning and the human verify path.

## Relationship to clone-app

`clone-app-pat-pro` reproduces *structure* and hits fidelity by **copying the
source's code, framework, and libraries**, gated on static computed-style
assertions. YoinkIt keeps the cloning goal and much of the rigor, but refuses
that shortcut: faithful to the *experience*, idiomatic in the *code*. The burden
therefore moves onto capture quality and clean decomposition — which is the
actual moat, and the part clone-app waves away
("motion is rules, a coding agent rebuilds it from the spec").

## First client: build order

Scoped to one landing page. The approach is **tracer-bullet** — prove the whole
loop on *one* Region before building breadth — with the Report front-loaded
because legibility (not breadth) was the blocker:

1. **Place-first Map, primary viewport first** — the Page-model skeleton
   (regions + rects + crops + assets) everything hangs on. The schema is already
   multi-viewport, but the first workbench slice only has to measure the primary
   viewport unless a run explicitly requests additional viewports.
2. **Report v0, before capture** — render the dimensional scaffold with region
   overlays and gaps from *just the map*. Highest-leverage early win: you can
   *see* and validate the referent before any motion work. This is the first
   Map Gate.
3. **Observe capture: focus-area + clip + trigger** — merging into the Page model,
   Report re-rendering. Prove on one motion (mammoth's work-card hover).
4. **Spec + `implement` skill** — Spec → one clean component you watch move. The
   full loop closed on a single motion.
5. **Then widen** — corridor (scroll), arm (load reveals), multi-viewport map,
   accretion across passes, more regions.
6. **Later frontier** — machine build-gate (re-yoink + diff), page transitions,
   asset capture narrowed to motion-dependent.

> **This order is provisional.** It is what looks smart now, not a settled
> sequence — the shape is still fuzzy. An agent implementing it that finds a good
> reason to reorder or rethink a step should **signal it**, not follow blindly.
