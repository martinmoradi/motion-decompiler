# YoinkIt — Architecture (product design of record)

This is the product-level north star: what YoinkIt is for, the unit of work, the
pipeline shape, and how a yoink converges. It sits *above* the engine pipeline
detail in [SPEC.md](./SPEC.md) and the execution sequence in
[ROADMAP.md](./ROADMAP.md). Vocabulary used here is defined in
[CONTEXT.md](../CONTEXT.md). The two hard decisions behind it are recorded in
[docs/adr/](./adr/).

## What YoinkIt is for

YoinkIt exists to **copy-and-modify high-end frontend craft instead of inventing
from a blank page.** There is one spine and one forcing function:

- **B (the spine): deliver client prototypes fast.** Real client, real deadline,
  branding/design done by a non-designer. The strategy is copy-then-modify, not
  invent.
- **A (a quality bar on B, not a separate product): legibility.** A yoink's
  output has to be understandable enough that the human can modify it and learn
  from it. The recurring "the data is too cryptic to get value from" complaint is
  B failing its A bar.
- **C (the compounding payoff): a remixable library.** Every yoink deposits a
  "premium LEGO" — a clean, decomposed motion you can recombine later. C accretes
  for free *if* B's output is clean and legible. It is not a thing to build now.

It is **not** a 1:1 site cloner. See [ADR-0001](./adr/0001-reexpress-not-clone.md).

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

1. **Map** — static structure into a legible, **place-first page model**: an
   ordered list of [Region]s top-to-bottom, each with rect + scroll-Y + crop +
   human-readable name, with captures (hovers, reveals, loops, scroll-triggers)
   nested *inside* the region they belong to. Cheap, headless. This is the
   referent captures attach to and the model the Report renders to scale; without
   it, captured IDs are floating signifiers. (The current engine emits a
   capability-first flat selector bag — `{ scrollTriggers[], hoverCandidates[],
   loops[], … }` — and will be rebuilt place-first.)
2. **Capture** — measure motion, attached to the map's named Regions. Two modes:
   - **Automated** — the agent drives known triggers (hover/scroll/click).
   - **Observe (human-guided)** — the human drives a real browser and the engine
     measures. The capture mode for the hard stuff automation misses
     (choreography, invisible hover zones, "the good bit"). See [the observe-mode
     spec](./specs/human-guided-observe-mode.md) and *Observe mode in practice*
     below.
3. **Report + Spec** — *two projections of one canonical [Page model]*, never
   authored in parallel. The Map builds the page model's skeleton, each capture
   pass enriches it, and the human annotates it through the Report. This
   single-source discipline (clone-app's `DESIGN.md`/`assertions.json` move) is
   what guarantees **no drift** between what the human sees and what the build
   agent ingests.
   - **Report** (human-facing render): a scroll-accurate HTML scaffold of the
     page, placeholders at real positions, captured motion/crops/verify-flags
     pinned where they happen. For *assessment*. Accretes across passes; makes
     gaps visible. Zero context cost — it never re-enters an agent. Human edits
     (rename, importance, verify, note) write *back into* the page model.
   - **Spec** (machine-facing serialization): the compact JSON the build phase
     ingests. The only projection that re-enters context.

The downstream **`implement`** skill is a *separate context*: it reads the Spec
and builds clean running components. Kept separate so capture never bloats with
implementation. See [ADR-0002](./adr/0002-spec-report-separate-build.md).

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
[ADR-0001](./adr/0001-reexpress-not-clone.md)'s "don't haul their bytes," to be
narrowed to assets-the-motion-depends-on once the baseline workflow is proven.

## Two convergence loops, the Report is the handoff

- **Capture loop — human-gated completeness.** Passes accrete into the Report
  (automated, then observe, then scroll, …). The human decides when every element
  is there. Completeness is *signature judgment*, which is inherently human.
- **Build loop — machine-gated fidelity.** The build agent re-yoinks its own
  output and diffs the captured motion against the Spec. The engine that *creates*
  the spec is the *gate* that verifies the reproduction — a loop clone-app
  structurally cannot run for motion.

Gate tightness tracks each item's **Confidence**: `measured` items gate tight
(like clone-app's structural assertions); `verify` items get loose tolerance or a
human check. Driving the gate tighter than the spec's own confidence is chasing
measurement noise.

**The system's quality ceiling is set by capture quality, not build quality.** A
good spec converges easily under self-measurement; an uncertain spec cannot be
rescued by build-side measuring, because the build is hill-climbing toward the
wrong target. This is why the investment goes into capture quality and the
human observe loop — they raise the ceiling the build can reach.

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

## Divergence from clone-app

`clone-app-pat-pro` reproduces *structure* and hits fidelity by **copying the
source's code, framework, and libraries**, gated on static computed-style
assertions. YoinkIt refuses that shortcut: faithful to the *experience*,
idiomatic in the *code*. The burden therefore moves onto capture quality and
clean decomposition — which is the actual moat, and the part clone-app waves away
("motion is rules, a coding agent rebuilds it from the spec").

## First client: build order

Scoped to one landing page. The approach is **tracer-bullet** — prove the whole
loop on *one* Region before building breadth — with the Report front-loaded
because legibility (not breadth) was the blocker:

1. **Place-first Map, single viewport** — the Page-model skeleton (regions +
   rects + crops + assets) everything hangs on. Multi-viewport deferred.
2. **Report v0, before capture** — render the dimensional scaffold with region
   overlays and gaps from *just the map*. Highest-leverage early win: you can
   *see* and validate the referent before any motion work.
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
