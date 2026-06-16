---
name: yoinkit
description: >-
  Yoink what a live web page's animations ACTUALLY do — sampled per frame by
  the engine and emitted as an agent-ready SPEC (libraries, per-layer
  timing/easing, frame timelines), never code. Run ONLY when the user explicitly
  invokes /yoinkit, with either a URL (yoink the whole page) or a
  request about a specific page's motion (yoink the targeted animation). This
  is a heavy, real-browser-driving pipeline: do NOT trigger it for general
  questions about CSS or animation, how to animate something, GSAP/ScrollTrigger
  usage, recommending a library, or reviewing existing animation code — none of
  those are yoinking requests. No auto-trigger from keywords; explicit
  /yoinkit invocation only.
compatibility: >-
  Run from the YoinkIt repo root. Needs Bun and agent-browser
  (the tool self-drives a real headed browser via bin/capture-browser). Repair
  diagnosis uses parallel subagents (the Agent tool).
---

# YoinkIt

Yoink a live page's motion into **yoinked motion**, an agent-ready spec — libraries, a
summary, per-layer timing/easing, and per-frame timelines — that a *coding* agent
later rebuilds from. The spec is the product; this skill never emits recreation
code.

## The one rule that shapes everything: script measures, agent judges

`extension/capture-animation.js` (via `bin/yoinkit`) is the **sole
measurement instrument**. Every duration, easing, from/to value, frame count, and
`ok/check/empty/error` status comes from the engine's per-frame sampling — never
from a model.

This skill and its subagents decide **what** to capture, **how** to reach it, and
how to **repair** a failed capture. They never measure motion. The repair
diagnosis subagent's output schema has no measurement fields, and every repair is
**re-measured by the engine**; success is machine-checked against engine output,
not self-reported. If any step would route a measured number through a model, that
step is wrong — fix it, don't ship it.

This is also why capture needs a **real, visible browser**: headless/synthetic
events don't fire framework hover/scroll handlers (Webflow IX2, GSAP) and the
headless compositor may not advance transitions. The tool already opens headed via
`bin/capture-browser`; just run it from the repo root.

## Input routing (do this first)

Look at what the user passed to `/yoinkit`:

- **A URL** (e.g. `https://example.com/`) → **whole-page** scope. Yoink every
  animation the planner proposes.
- **A natural-language request about a page** (e.g. "help me understand the hero
  animation on example.com", "what's the card hover on acme.dev/work") →
  **targeted** scope. Resolve the URL from the text, map the page, then reason over
  the map to focus capture + the report on the animation(s) the user asked about.

If no URL is present or resolvable, ask the user for one. Don't guess a URL.

## The pipeline

Run these stages in order, from the repo root. Replace `<url>` and use the printed
run dir. Heavy artifacts land under `runs/` (gitignored) — never commit them.

### 1–3. Map + plan (structure, stack, selectors, proposed captures)

```bash
./bin/yoinkit scout "<url>" --viewport 1280x800
```

This writes `map.json` (libraries, ScrollTriggers, hover candidates, split
reveals), `manifest.proposed.json` (the proposed capture manifest), and
`capture-plan.md`. Note the **run dir** it prints (`Run: runs/...`).

- **Whole-page:** use `manifest.proposed.json` as-is.
- **Targeted:** read `map.json` + `manifest.proposed.json` and pick the
  capture(s) that match the user's target. Reason over the map — match by
  section, selector, group, or capture `id` (e.g. a "hero" request → the
  `boot`/`load` reveal and the hero section's captures; a named hover → the
  hover capture whose `root` is under that component). Write a filtered manifest:

  ```bash
  bun skill/claude/scripts/filter-manifest.js \
    --in <run>/manifest.proposed.json --out <run>/manifest.targeted.json \
    --ids "hero-load,hero-headline-reveal"      # or --grep "hero|headline"
  ```

  Use `manifest.targeted.json` in the next step. If the target is ambiguous,
  briefly tell the user which captures you selected and why.

### 4. Capture (real headed browser) + dump diagnosis inputs

```bash
./bin/yoinkit capture <run> <run>/manifest.proposed.json --repair-dump
```

(Use `manifest.targeted.json` for a targeted run.) The engine samples each
capture per frame and **soft-fails** the rest, recording a structured `cause`.
`--repair-dump` additionally writes, for each repairable soft-fail
(`occlusion` / `hidden_not_visible` / `inert_representative`), a §2 diagnosis
input + a viewport screenshot under `<run>/repair/<id>.attempt-1.input.json`. It
runs **no** provider and re-measures nothing — it just stages the inputs so you
can diagnose failures in parallel next.

Read `<run>/capture-results.json`. Captures with `status` `ok`/`check` are
**captured first-try** — done. Captures with a `repairInput` field are the
repairable residual; everything else (other empties/errors, e.g. `pseudo_element`,
`wrong_document_iframe`) is left as an honest soft-fail.

### 5. Repair the residual (the agentic stage)

Only if there are captures with a `repairInput`. This is a **diagnose → apply →
re-measure** loop that *you* drive; the engine still does all measuring. Read
**`references/repair-loop.md`** for the exact loop (Phases A/B/C, the ceilings,
how to call `repair-step.js`, how Phase C threads attempt history). In short:

- **Phase A — diagnose (parallel, no browser).** For each `repairInput`, spawn one
  subagent with the prompt in **`references/diagnosis-subagent.md`**, handing it
  that capture's `input.json` + screenshot. It returns **strictly** the §3 output
  schema (a closed action enum + a machine-checkable `successCriterion`, defaulting
  to `expect: moved`). It never proposes a duration/easing/from-to. Save each as
  `<run>/repair/<id>.attempt-1.output.json`.
- **Phase B — apply + re-measure (serial, headed).** For each diagnosis, run
  `repair-step.js apply …`. It routes the output (terminal / low-confidence /
  actionable), and for actionable repairs clones the capture and lets the **engine
  re-measure** a fresh isolated single capture (M1 by construction). Status comes
  only from the engine; success is machine-checked.
- **Phase C — one retry.** For an actionable repair that didn't converge (and isn't
  terminal / repeated-identical), spawn one more subagent with the attempt history,
  stage `attempt-2.output.json`, and apply again. Honor the ceilings:
  `maxRetries=2`, `budget=min(2×repairableCount, 24)`, confidence floor `0.4`,
  repeated-identical → honest terminal.

`repair-step.js` writes the repair provenance (`origin`, `repair{}` block, terminal
causes) straight into `capture-results.json` in the §6 schema, so the engine's
status is never overridden — provenance only records *how* it was reached.

### 6. Assemble + report

```bash
./bin/yoinkit assemble <run>
./bin/yoinkit report <run>
```

`assemble` builds `animations.json` + `animations.md` (the yoinked motion spec); `report` builds
`report.md`. The repaired timelines were promoted into `<run>/timelines/`, so they
flow into the spec automatically.

## What to deliver to the user

Point them at the spec and report, and surface the repair provenance honestly:

- The yoinked motion spec: `<run>/animations.json` and the readable `<run>/animations.md`.
- The report: `<run>/report.md`.
- A short summary distinguishing **captured first-try** vs **captured
  after-repair** vs **honest terminal** (nothing to capture / needs a human), with
  the per-bucket repair count if any repairs ran. For a **targeted** request, lead
  with the animation the user asked about: its layers, timing, easing, and the
  frame timeline.

Never present recreation code — the deliverable is the spec a coding agent rebuilds
from.

## Constraints

- **Real headed browser for capture** (the tool handles this via
  `bin/capture-browser`). Map/plan also runs through the tool; just run from the
  repo root.
- **Framework-agnostic, no per-site hardcoding.** The diagnosis subagent reasons
  from structure (the §2 `repairContext`), never from a hardcoded selector list.
- **Don't commit captures.** `runs/` and `*.animation.json` are gitignored. Commit
  only skill/tool changes, never run artifacts.
- **The invariant holds end to end.** If you ever find yourself reading a duration
  or easing out of a subagent's reply, stop — that number must come from the
  engine. The subagent only ever names selectors, actions, and a terminal verdict.

## Reference files

- `references/repair-loop.md` — the skill-driven repair loop: routing, ceilings,
  `repair-step.js` usage, Phase C retry, provenance.
- `references/diagnosis-subagent.md` — the exact prompt + rules for each Phase A/C
  diagnosis subagent (the intelligence artifact).
- `references/repair-contracts.md` — the §2 input, §3 output (action enum, success
  criterion, terminal causes), and §6 provenance schemas, condensed for runtime.
- `references/drivers.md` — how the browser is driven for this repo, and the
  driver-agnostic recipe primitives.
