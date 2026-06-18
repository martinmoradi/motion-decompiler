---
name: subslice
description: Use only when the user explicitly invokes /subslice, $subslice, or asks to run the subslice skill. Cross-check one audit subslice report against its parent overview and cloned source repo, then write an evidence-rich integration note without editing the audited reports.
---

# Subslice

## Overview

Cross-check exactly one audit subslice. Read the target leaf report, its parent
overview, and the cloned source implementation deeply enough to produce notes a
later integration agent can apply to the reports.

Default to **notes only**. Do not edit the source repo, parent overview, or leaf
report unless the user explicitly asks for an apply/edit pass.

## Quick Start

From the YoinkIt repo root:

```bash
node skill/subslice/scripts/resolve-subslice.mjs 01a
```

The resolver prints JSON with:

- `leaf`: the subslice report to cross-check.
- `parent`: the overview report in the same section.
- `sourceRoot`: the cloned repo to verify against.
- `note`: the only file to write in the default notes-only pass.

The user may also pass an explicit report path instead of a short id.

## Workflow

1. Resolve the target with `scripts/resolve-subslice.mjs`.
2. Read the leaf report and parent overview. Treat both as context, not edit
   targets.
3. Identify the leaf's claims before reading code: counts, file/line references,
   architecture claims, runtime behavior, data shapes, algorithms, "STEAL/ADAPT"
   lessons, and any suspected correction.
4. Verify against `sourceRoot`. Use CodeGraph first when the repo or worktree has
   a `.codegraph/` index. Otherwise use `rg` and direct source reads.
5. Prefer canonical implementation files under `audit/impeccable/source/cli`,
   `extension`, `site`, `skill`, etc. Do not treat copied/generated skill bundles
   under hidden agent folders such as `.agents`, `.claude`, `.cursor`, `.gemini`,
   or generated bundles as canonical unless the subslice is specifically about
   distribution artifacts.
6. Check every important markdown link and cited source path. For line refs,
   verify the referenced symbol or behavior still exists; exact line numbers may
   drift, but the note should call out stale or misleading anchors.
7. Write only the note file from the resolver. Create parent directories as
   needed.

## Note Contract

Write a markdown note with this shape:

```markdown
# Subslice <id> Cross-Check Notes

Target: `<leaf>`
Parent context: `<parent>`
Source root: `<sourceRoot>`

## Executive Delta

- ...

## Corrections To Apply

| Report area | Current claim | Evidence | Suggested change |
|---|---|---|---|

## Deep Implementation Notes

- ...

## Paradigms Worth Importing

- ...

## Link And Citation Checks

- ...

## Open Questions

- ...
```

Keep the note actionable for a later integrator. Include enough cited evidence
that the integrator can patch the report without rediscovering the code. Do not
pad the note with generic praise.

## Verification Standards

- Separate confirmed facts from inferences.
- Cite file paths and symbols for every correction or meaningful enrichment.
- Recompute counts or matrices from source when the leaf relies on them.
- Preserve useful Opus framing when it is correct; improve it with stronger
  evidence rather than rewriting for style.
- For YoinkIt transfer notes, explain the implementation pattern and why it
  matters. Avoid vague "we can learn from this" language.

## Parallel Work Rules

- In fan-out mode, each subslice worker writes a unique note file only.
- Do not edit parent overview reports during fan-out.
- Do not edit sibling notes.
- If multiple agents run in worktrees, use one branch per subslice based on the
  integration branch, then merge the note files into the integration branch.
