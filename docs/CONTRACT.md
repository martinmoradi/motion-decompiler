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

```text
yoink-runs/{slug}/
├── 00-config.json
├── page-model.json
├── map/
│   ├── measurements.json
│   ├── assertions.json
│   ├── coverage.md
│   └── exceptions.json
├── capture/
│   └── passes/
│       └── pass-001/
│           ├── pass.json
│           ├── clips/
│           └── crops/
├── report/
│   └── index.html
├── spec.json
└── implement/
    ├── static-assertions.json
    ├── motion-assertions.json
    └── qa/
```

`page-model.json` is the canonical artifact. The Report and Spec are projections
of it. They are never hand-authored in parallel.

`00-config.json` is the shared interface between the agent skill and the
deterministic CLI. Skill arguments and CLI flags both compile into this file
before stage commands run.

It is also shared by `implement`. `spec.json` remains the main implementation
input, but operational settings such as output path, target stack, gate
tolerances, and check-in policy live under an `implement` section of the same
run config.

Minimum shape:

```json
{
  "targetUrl": "https://example.com",
  "scope": "page",
  "viewports": ["desktop", "mobile"],
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

## Stage Spine

```text
Map -> Map Gate -> Capture -> Report + Spec -> Implement
```

The agent may run deterministic helper commands inside a stage. It must not cross
a gate boundary until the gate passes or the human explicitly approves a recorded
exception.

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

## Map Stage

Map builds the Page model skeleton. It is place-first: Regions ordered
top-to-bottom, with captures nested later inside their spatial home.

Map must write:

- `page-model.json`
- `map/measurements.json`
- `map/assertions.json`
- `map/coverage.md`
- `map/exceptions.json`
- `report/index.html` as Report v0

Each Region must have:

- stable id
- human-readable name
- per-viewport rect and scroll-Y
- per-viewport presence
- crop path or `null + reason`
- static visual evidence where available
- source selectors or `null + reason`

## Map Gate

The Map Gate is binary. It passes only when all of the following are true:

- every required Map assertion passes
- every required coverage row is complete
- every unknown has `null + reason`
- every exception is explicitly human-approved and recorded
- the human approves Report v0

Map assertions cover at least:

- important visible sections are represented as Regions
- Region rects match the source within the configured tolerance
- crops align with the source Region
- scroll order is correct
- responsive presence is correct for the mapped viewports
- Region names are stable enough for capture and implementation handoff

There are no agent-controlled warnings. A finding is one of:

- **Required assertion failure**: blocks the gate.
- **Out of scope**: excluded before the gate with a reason.
- **Human-approved exception**: allowed only when recorded in
  `map/exceptions.json`.
- **Info**: visible note only, not part of the gate.

## Report

The Report is the human-facing projection of the Page model. It is written to
disk and opened in a browser. It does not re-enter agent context unless the human
or agent explicitly reads a small part of it.

Report v0 must support three view modes:

- **Source mode**: source-like crops and measured static visuals first, exact
  Region positions, minimal debug overlay.
- **Region mode**: artificial tints, inset non-layout-affecting borders, labels,
  hover outlines, and tooltips.
- **Gate mode**: missing, uncertain, failed, or blocking items emphasized.

Edits made through the Report write back to `page-model.json`. They do not
decorate the HTML only.

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

`spec.json` is the machine-facing projection of `page-model.json`. It is compact
and agent-ingestable. It references Clip paths but does not inline frames.

The Spec must preserve:

- Region identity and viewport applicability
- Static Fidelity facts needed by implementation
- measured motion facts
- Confidence
- human Notes that affect implementation judgment
- recorded exceptions

## Implement Stage

`implement` consumes `spec.json` first. The Report and Clips are supporting
evidence. The implementation skill inherits clone-app's build rigor where it
does not conflict with YoinkIt.

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
- the Architecture stage writes `implement/architecture/file-tree.md`,
  `implement/architecture/component-map.md`, and
  `implement/architecture/motion-map.md`
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
`page-model.json`, `spec.json`, implementation QA artifacts, and the Report
status, then works with the human to choose the next focused target.

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
