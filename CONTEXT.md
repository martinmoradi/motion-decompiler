# YoinkIt

YoinkIt is a cloning workflow for high-end frontend craft: it captures what makes
a web experience feel premium, chiefly its motion, faithfully enough to
understand, reproduce, modify, and reuse it. It clones the experience, not the
source code.

## Language

### The product

**Yoink**:
To clone a source experience in a way that can be modified: capture what makes it
good (its [[Signature]], chiefly motion), measure it faithfully, and re-express it
as clean, remixable components with clear props and docs. Faithful to the
*experience*, idiomatic in the *code*.
_Avoid_: Scrape, rip, source-code clone.

**Signature**:
The specific motion and design that make a site feel premium — the part worth
yoinking. Distinct from incidental polish, ambient loops, and background noise,
which are measured but not the point.

**Fidelity of understanding** (high):
How faithfully a yoink measures what the site actually does. The capture must be
accurate enough that the motion can be reproduced "as good as possible." This is
the bar that matters.

**Static Fidelity**:
Strict measured accuracy for the non-motion facts of the experience: Region
geometry, scroll positions, crops, responsive presence, layout dimensions,
colors, typography, assets, and states. High Static Fidelity is required because
bad static facts poison the Report, Spec, observe targeting, and implementation
foundation.
_Avoid_: Pixel perfect.

**Source-code Fidelity** (none, deliberately):
YoinkIt does *not* reproduce the source's code structure, framework, or
libraries. Output is clean, idiomatic components — not a code-level clone. This
is the deliberate split from a source-faithful site cloner.

**House stack**:
The default implementation stack YoinkIt uses for built outputs so yoinks share a
common component and motion vocabulary. It can be overridden explicitly for a
project, but it is never inferred from the source site's stack.

**Implementation token layer**:
The editable design and motion variables produced during implementation so the
final product can be adjusted and remixed by a human. It is derived from measured
yoink evidence, but it is part of the clean output, not a copy of the source
site's token system.
_Avoid_: Source tokens.

### The unit of work

**Choreography**:
The cross-element, cross-scroll, cross-navigation sequence that makes a site tell
a story: what reveals as you scroll, what happens on a page transition, the order
and timing of the journey. The [[Signature]] at the whole-experience level. Not
reducible to a section's tokens or a set of individual motions — it is the
connective tissue between them.

### The page model and its projections

**Page model**:
The single canonical model of a yoink: the place-first set of [[Region]]s, the
captures nested in them, their [[Confidence]], crops, and human notes. The [[Map]]
builds its skeleton; each [[Capture]] pass enriches it; the human annotates it
*through* the [[Report]]. It is the one source of truth — the [[Report]] and the
[[Spec]] are both *projections* of it, never hand-authored in parallel. This is
what guarantees no drift between what the human sees and what the build agent
ingests. It has a **viewport** axis: the [[Map]] fills layout/assets/presence at
each viewport (cheap, headless), while motion is captured primary-viewport-first
and tagged with viewport-applicability (see [[Region]]).

**Region**:
A positioned area of the source page in the [[Page model]]'s place-first model:
rect + scroll-Y + crop + human-readable name. Captures (hovers, reveals, loops,
scroll-triggers) live *inside* the region they belong to, rather than in flat
global lists — which is what gives every capture a recognizable spatial home
instead of a floating selector. Regions, ordered top-to-bottom, are what the
[[Report]] renders as positioned placeholders. Authored automatically by the
[[Map]] or by hand via a [[Focus area]].

A Region is also the stable spine **across viewports**: it carries per-viewport
layout (rect, assets, *presence* — some regions are absent at some breakpoints),
and the motions attached to it carry a **viewport-applicability** tag (`all` by
default; `mobile-only`, `pointer-only`, … for exceptions, with per-viewport
variants when the same motion differs). The build rule is deterministic: for each
viewport, render the regions present there, with their per-viewport layout, plus
the motions applicable there — the agent never guesses applicability at build
time. Applicability is part-inferred by the [[Map]] (visibility per viewport,
pointer vs touch) and part-marked by the human in observe (a [[Note]] like "this
is the mobile menu").

**Report**:
The human-facing *projection* of the [[Page model]]: a scroll-accurate HTML
scaffold mirroring the source page's real dimensions, with correctly sized
[[Region placeholder]]s pinned at their real positions and captured motion,
crops, embedded [[Clip]]s, and verify-flags attached where they happen. Built to
be *looked at and assessed*, not implemented.
Written to disk and opened in a browser — it never re-enters an agent's context.
It *accretes* across capture passes (each pass merges in, it is not regenerated)
and is meant to make *gaps* visible: blank regions are the parts not yet captured.
The human gates completeness by judging the report done. Edits the human makes in
the report (rename, importance, verify-flag, note) write *back into* the
[[Page model]], they do not decorate the HTML. [[Report View Mode]]s let the
same Report serve source-like assessment, Region debugging, and gate review
without changing the underlying model.
_Avoid_: Doc, output (too generic).

**Improve pass**:
A focused follow-up cycle started from an existing [[Report]], [[Spec]], and
implementation status. The agent reads the run state, uses the Report to orient
with the human, and works only on the gaps or failures that matter next.

**Report View Mode**:
A way of looking at the [[Report]] for a specific assessment task. Source mode
emphasizes source-like crops and measured static visuals; Region mode emphasizes
artificial overlays, labels, and tooltips; Gate mode emphasizes missing,
uncertain, or blocking items.

**Spec**:
The machine-facing *projection* of the [[Page model]]: the compact structured
(JSON) record the downstream implementation agent ingests. The same data as the
[[Report]], minus the visual scaffold. The only projection that re-enters agent
context. It references [[Clip]] paths but never inlines frames — the build agent
samples frames only for low-[[Confidence]] items, ideally via a delegated
sub-agent that returns a text verdict.

**Draft implementation**:
A build started after the [[Map Gate]] passes but before Capture completeness has
been approved. It can be strict on [[Static Fidelity]] and measured motion, but it
must carry verify items and gaps honestly.

**Candidate implementation**:
A build started from a Capture-approved [[Spec]], or promoted after open verify
items and gaps are resolved enough for final review.

**Confidence**:
A per-item honesty marker on captured motion: `measured` (sampled from real
frames) vs `verify` / `unknown` (inferred from the registry or signature tokens,
not directly measured). It is the system's truth-in-advertising, and it drives
how tightly the build loop gates each item — `measured` items gate tight,
`verify` items get loose tolerance, a human check, or a [[Clip]].

**Clip**:
A short video of a captured motion, recorded during a [[Pass]] — cropped to the
[[Focus area]] (area mode) or the viewport (corridor mode). A *second kind of
evidence* alongside the measured [[Spec]]: pixels, not numbers. Lives on disk
(cheap). The [[Report]] embeds it so the human can *watch* the real motion while
assessing — the cure for "you can't assess a bezier." For the build agent it is
the visual companion to low-[[Confidence]] captures only: frames are sampled
on-demand, ideally by a **delegated sub-agent** that views them in its own
context and returns a compact text description, so the build context never
ingests pixels for items the [[Spec]] already nails. It does not enable a tighter
machine gate (pixel-diffing a clean remix against the source is rejected); it
feeds agent reasoning and the human verify path.

### The pipeline

**Recon**:
The pre-Map reachability and source-orientation stage. It proves the source page
can be reached and described at the configured viewports, recording readiness,
redirects, blockers, viewport facts, page dimensions, and source metadata; it
does not author [[Region]]s or motion candidates.

**Map**:
Static analysis of a page's structure (GSAP/ScrollTrigger registry, CSS
keyframes, transitions, DOM split-reveal). Cheap, works headless, generalizes
well. The honest, precise half of the tool. Its output is a **place-first page
model**: an ordered list of [[Region]]s top-to-bottom, *not* a flat inventory of
capabilities. It is the model the [[Report]] renders to scale.
_Avoid_: Scan (means something narrower in the engine API).

**Static Map**:
The first Map pass: the pure static scaffold of the page before human
back-and-forth. It proves Region identity, boxes, layout, colors, typography,
assets, and [[Region placeholder]] shape and size.

**Motion Scout**:
The second Map pass: a pre-human discovery pass for likely motion targets using
static and runtime-readable clues such as animation registries, CSS transitions,
keyframes, split reveals, hover affordances, and scroll triggers. It produces
motion candidates, not measured motion facts.

**Map Gate**:
The approval point between [[Map]] and [[Capture]] where the human checks that
the [[Report]] v0's Regions, rects, crops, scroll positions, responsive presence,
and names are accurate enough to serve as the spatial truth for capture and
implementation. It is binary: required assertions pass, [[Static Map]] coverage
is complete, [[Motion Scout]] discovery coverage is complete, unknowns are
recorded honestly, and exceptions proceed only when human-approved.

**Map workbench**:
The deterministic pre-Capture workspace for proving [[Recon]], [[Static Map]],
[[Motion Scout]], [[Report]] v0, and [[Map Gate]] artifacts for a run. It is not
[[Capture]], [[Spec]], or implementation, and it does not make product judgments.

**Region placeholder**:
The Report's static visual stand-in for a [[Region]] before implementation. It
has the Region's measured position, shape, and dimensions, plus static visual
evidence where available; it is not an implementation component.
_Avoid_: Component (too easily confused with implementation components).

**Dependency-Aware Gate**:
A gate that blocks only the stages that depend on the missing evidence. A later
stage may proceed when its prerequisites are met, as long as lower-confidence
items and gaps are carried forward honestly instead of being treated as measured.

**Capture**:
Driving real events in a real, visible browser and sampling computed style per
frame to measure motion. Only ~a third reliable when automated; failures are
named and repeating. The hard half of the tool. Runs in two modes: automated
(agent drives known triggers) and observe (human-guided, see below).

### Observe mode (human-guided capture)

**Focus area**:
The *spatial* observe gesture: the human draws a box around a part of the page;
the engine samples only the motion bounded inside it. Captures Region-level
[[Signature]] (a hover, a reveal, a card settle) and, in doing so, authors a
[[Region]] in the [[Page model]]. The reliable spine of observe mode — it turns
segmentation from "disentangle the whole page" into "measure what moves in this
box."

**Corridor**:
The *temporal* observe gesture: the human marks a start and an end along the
scroll axis (or, later, a navigation event); the engine samples motion across
that range keyed by scroll *progress*, not just elapsed time. The twin of
[[Focus area]] for things a box can't hold — scroll-scrub, pinned timelines, page
transitions. Captures [[Choreography]].

**Trigger**:
What fires a motion (`hover`, `scroll`, `click`, `cursor-follow`, …). A *measured*
field, inferred from the event stream the engine logs — not declared by the human.
Drives [[Confidence]]: a clean `event → motion` is `measured`; an ambiguous or
chained one is `verify` and invites a human confirm.

**Note**:
Free-text human intent attached to a region or mark ("watch the cards, not the
background", "the signature transition", importance: signature/useful/polish/
ignore). For judgment the engine *cannot* measure. Never for mechanics (trigger,
duration, easing) — those are measured, not commented.

**Pass**:
One human-driven, agent-async enrichment cycle. The engine records locally in the
page (cheap continuous event log + bounded ring buffer; heavy per-frame sampling
only inside a [[Focus area]] and only during a record burst), the human
annotates, and finalizing writes a compact artifact to disk. The agent merges
that artifact into the [[Page model]] *afterward* — it is not live in the loop
during recording. The human is, in effect, shaping the next handoff. Passes
accrete; the human ends the [[Capture]] loop by judging the [[Report]] complete.
