# Map all viewports, capture motion primary-viewport-first; reconcile via the Region

A faithful landing-page baseline is responsive, but motion-capture is the
expensive, ~⅓-reliable, human-driven part of the tool. So we split by cost: the
**Map runs at every viewport** the client needs (cheap, headless — layout,
positions, crops, assets, presence), while **motion is captured primary-viewport-
first** and extended to another viewport only where it genuinely differs (a
mobile-only hamburger, a hover that becomes a tap).

The two granularities are reconciled by a **schema shape, not a phase**: the
Region is the stable spine across viewports. It carries per-viewport layout
(rect, assets, presence), and each motion carries a **viewport-applicability**
tag (`all` by default; `mobile-only`/`pointer-only`/… for exceptions, with
per-viewport variants when a motion differs). The build rule is deterministic:
per viewport, render the regions present there with their per-viewport layout
plus the motions applicable there.

## Why this is worth recording

Without an explicit reconciliation shape, a model that holds three viewports of
layout but one viewport of motion **confuses a build agent** — it can't tell
whether a desktop motion should exist on mobile, or which layout a capture
belongs to. Making the Region the join key, defaulting applicability to `all`,
and tagging only the exceptions is the minimum that keeps the model unambiguous
without forcing motion to be captured three times. The asymmetry (full map,
focused capture) is deliberate and will look surprising to anyone expecting
clone-app-style uniform per-viewport extraction.
