# Mammoth Murals Calibration Run

Target: `https://mammothmurals.com/`

Date: 2026-06-15

This folder preserves the blind-run outputs that exposed the gaps addressed by
Engine V2. They are reference evidence for humans and future agents, not product
output and not automated fixtures.

## Contents

- `initial-animations.json` - top-level animation output from the first run.
- `yoink-run-prompt.md` - the prompt used to drive the run.
- `AGENT-RUN-AUDIT.md` - audit notes from comparing blind-run outputs.
- `claude/` - Claude-generated map, captures, timelines, and assessment.
- `codex/` - Codex-generated map, captures, timelines, and assessment.

## Gaps Exposed

- Multi-property captures could collapse to the first changed property, losing
  evidence such as transform plus opacity plus clip/filter changes.
- Stagger detection could replace real sibling findings with a synthetic note,
  making the timeline less useful for reconstruction.
- Ambiguous selectors could resolve to hidden first matches and miss the
  rendered element that actually moves.
- Height/width-driven motion, especially accordion-style interactions, needed to
  be sampled alongside transform and paint properties.
- The picker needed to stay one-click while waiting for a capture to settle
  instead of truncating active transitions.

## Future Comparisons

Use these files as a before snapshot when validating future engine runs against
Mammoth Murals. A useful comparison checks that new captures preserve all moved
layers, keep all changed properties for each layer, report ambiguous selector
counts, and produce usable locators for hover, reveal, CTA, FAQ, sprite, and
scroll-state motion families.

Do not wire this folder into automated tests yet. The lightweight smoke tests in
`tests/` cover deterministic engine behavior; this folder remains a calibration
record for real-world motion.
