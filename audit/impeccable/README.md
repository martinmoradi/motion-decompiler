# Impeccable: Deep Audit

A deep technical audit of [github.com/pbakaus/impeccable](https://github.com/pbakaus/impeccable), read through the lens of **YoinkIt**. The goal was not "what is it" but "how does it work, deeply, and what can we steal." The short answer: Impeccable independently solved the three problems at the center of YoinkIt's architecture (understand an arbitrary website, run from a real browser, collaborate with an agent about it), plus a fourth YoinkIt has not tackled yet (ship one skill to many agent harnesses from a single source).

## Start here

1. [`00-EXECUTIVE-SUMMARY.md`](00-EXECUTIVE-SUMMARY.md): what Impeccable is, the three-layer architecture, the master diagram, the Impeccable↔YoinkIt correspondence, and the one framing you must hold before reading anything else (the inversion: same shape, opposite physics).
2. [`PATTERNS-FOR-YOINKIT.md`](PATTERNS-FOR-YOINKIT.md): the payoff. Every transferable pattern, organized by YoinkIt concern, each tagged STEAL / ADAPT / AVOID with `file:line` references and a concrete YoinkIt application. Ends with a ranked priority list.
3. [`diagrams/system-map.md`](diagrams/system-map.md): consolidated visuals, including a forward-looking "YoinkIt target architecture" diagram showing what adopting the top patterns would look like.
4. [`reports/`](reports/): the six subsystem deep-dives. Full depth, written straight to disk so nothing was lost compressing through a summary. 3,500+ lines, 16 diagrams, 320+ `file:line` references.

## The six deep-dive reports

| # | Report | One-line | Layer |
|---|---|---|---|
| 01 | [Detector engine](reports/01-detector-engine/01-detector-engine.md) | Deterministic no-LLM engine; one pure rule core runs across a Node cascade / Puppeteer / injected / regex; design-system extraction; a hand-rolled ~1000-line CSS cascade; fail-open completeness | Understanding |
| 02 | [Chrome extension](reports/02-chrome-extension/02-chrome-extension.md) | MV3 service-worker hub; engine generated then embedded; CSP two-tier injection ladder; MAIN-world bridge with a ready handshake; on-demand injection; SW-death survival | Surface |
| 03 | [Live mode orchestration](reports/03-live-mode-orchestration.md) | The crown jewel: local server + SSE + long-poll + leased events + append-only session journal; crash-recoverable agent↔human loop; carbonize two-phase commit | Collaboration |
| 04 | [Live mode manual edits + overlay](reports/04-live-mode-manual-edits.md) | The 11k-line in-page overlay; element picker + self-stabilizing dual locator; browser-edit→source round-trip with redundant evidence, server-side verification, and rollback | Collaboration |
| 05 | [Skill + harness distribution](reports/05-skill-harness-distribution.md) | One `SKILL.src.md` compiled to 13 harnesses via ~170 lines of transformer over two config tables; placeholder substitution; conditional blocks; build-enforced counts | Distribution |
| 06 | [Hook system](reports/06-hook-system.md) | Provider-native hooks run the detector on every edit; post-edit surface vs pre-write block; "never break the turn" fail-open contract; anti-nag machinery; two-tier config | Surface |

**Detector deep dives.** Report 01 now has four companions that go below the overview and correct a few first-draft details: [`01a`](reports/01-detector-engine/01a-rule-trinity-and-dispatch.md) (the rule trinity, engine dispatch, and the full rule×engine matrix), [`01b`](reports/01-detector-engine/01b-css-cascade-engine.md) (the hand-rolled CSS cascade), [`01c`](reports/01-detector-engine/01c-color-and-contrast-tiers.md) (color science and the three-tier contrast escalation), and [`01d`](reports/01-detector-engine/01d-selector-and-footprint.md) (selector generation and footprint scrubbing). Start from the box at the top of [report 01](reports/01-detector-engine/01-detector-engine.md).

**Chrome extension deep dives.** Report 02 now has four companions that go below the overview and correct several first-draft and upstream-doc details: [`02a`](reports/02-chrome-extension/02a-manifest-permissions-build.md) (manifest, permissions, and the generate-then-embed build pipeline), [`02b`](reports/02-chrome-extension/02b-messaging-and-survival.md) (the messaging topology, the two-hop bridge vocabulary, and the MV3 service-worker-death survival kit), [`02c`](reports/02-chrome-extension/02c-injection-and-main-world.md) (MAIN-world injection, the CSP two-tier ladder, the ready-handshake race, idempotency, and footprint scrubbing), and [`02d`](reports/02-chrome-extension/02d-devtools-surfaces.md) (the panel/sidebar/popup surfaces, `inspect`/`$0` integration, and copy-as-markdown). Start from the box at the top of [report 02](reports/02-chrome-extension/02-chrome-extension.md).

## What this audit concluded (one paragraph)

The instinct behind the audit was correct. Impeccable is the closest existing reference implementation of YoinkIt's architecture, built by someone who hit the same walls (selector drift across reloads, CSP, MAIN-world injection, arming before the engine loaded, agent latency, multi-harness duplication) and shipped solutions to all of them. The highest-value, lowest-risk takeaway is single-source skill distribution, which would delete YoinkIt's hand-maintained `skill/codex` and `skill/claude` copies. The deepest architectural takeaway is the collaboration loop: long-poll as a harness-agnostic agent transport, SSE to the browser, and an append-only journal that makes the loop crash-recoverable. The most directly droppable code is the selector generation and dual-locator re-resolution, which slot straight into `pick()` and `on(sel)`. The one thing to internalize before copying anything is that Impeccable writes code into the user's repo and treats capture as free, whereas YoinkIt emits a spec and treats the real-browser capture as the hard part: same shape, opposite physics, so steal the state machines and the transport, not the file-writing or the relaxed capture assumptions.

## Provenance and method

- **Target:** `github.com/pbakaus/impeccable`, shallow-cloned to `source/` (gitignored, not part of this repo's history). About 2,059 tracked files; the signal is concentrated in `skill/`, `extension/`, `cli/`, `scripts/`, and the root docs.
- **Audited:** 2026-06-18, against the then-current `main`.
- **Method:** six parallel deep-dive agents, each owning one subsystem and writing its full-depth report straight to [`reports/`](reports/). This synthesis layer (executive summary, patterns, diagrams, this index) was authored on top of those persisted reports.
- **A note on the reports:** they are research artifacts, dense and occasionally raw. Line numbers were accurate at audit time against the cloned `main`; re-verify against `source/` if a specific line matters, since the upstream repo moves. The CLAUDE.md inside the upstream repo is itself stale in places (for example it references line numbers in `cli/engine/detect-antipatterns.mjs` that is now a re-export facade); report 01 notes where.
