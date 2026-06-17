# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

## Before exploring, read these

- **`docs/README.md`** for the current docs index.
- **`CONTEXT.md`** for project language and glossary.
- **`docs/ARCHITECTURE.md`** for product shape and pipeline direction.
- **`docs/CONTRACT.md`** for procedural run contract, artifact ownership, and
  gate rules.
- **`docs/adr/`** for accepted architectural decisions. Read ADRs that touch the
  area you're about to work in.
- **`docs/specs/`** when a current feature spec touches the task.

If any of these files don't exist, proceed silently. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

Do not treat **`docs/archive/legacy-capture-pipeline/`** as current guidance.
Those files are historical context and archaeology only. If an archived doc
conflicts with the docs above, the current docs win.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, either reconsider whether you're inventing language the project doesn't use, or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
