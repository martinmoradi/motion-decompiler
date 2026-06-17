# A yoink emits Report + Spec; the build is a separate phase that verifies by re-yoinking

A yoink produces two artifacts from one capture run and stops there. Building
running components is a **separate phase in a separate context**.

- **Report** (human-facing): a scroll-accurate HTML scaffold of the source page,
  with placeholders at real positions and captured motion/crops/verify-flags
  pinned where they happen. For *assessment*. It accretes across capture passes
  and makes *gaps* visible. It never re-enters an agent's context, so it costs
  nothing to make lavish.
- **Spec** (machine-facing): the compact JSON the build phase ingests — the only
  artifact that re-enters context.

Two convergence loops meet at the Report: **capture** is gated by *human*
judgment of completeness (signature judgment is human); **build** is gated by
*measurement* — the build agent re-yoinks its own output and diffs the captured
motion against the Spec, with gate tightness driven by each item's `confidence`.

## Why this is worth recording

The intuitive design is one end-to-end run that builds the components directly.
We rejected it for two reasons. First, **context discipline**: making GSAP mid
capture-run bloats the capture context; keeping build downstream keeps each phase
clean. (Note: this refines the historical
[SPEC.md](../archive/legacy-capture-pipeline/SPEC.md), whose "runnable code is a
non-goal" is true *of the capture pipeline* — the separate build phase is where
code is produced.) Second, and more fundamental: **an agent is an unreliable
judge of its own fidelity** — it stops too early. The same engine that creates
the spec can re-measure the build objectively, which is a verification loop
`clone-app-pat-pro` structurally cannot run for motion (it re-reads static
computed styles; we re-capture motion).

## Consequence

The system's quality ceiling is set by **capture quality, not build quality**:
self-measurement makes a build faithful to the *spec*, and the spec is a sampled,
partly-inferred picture of the site. Investment therefore concentrates on capture
quality and the human observe loop. The machine build-gate is a later upgrade;
the first client ships on human-eyeball + fresh-context fixes.
