# YoinkIt — agent guide

This file is for agents working **on** this repo. End users *yoinking a site*
use the Codex skill in `skill/codex/` or the Claude skill in `skill/claude/`
(read its `SKILL.md`); this guide is about the tool itself.

YoinkIt captures what a web animation *actually does* (by sampling
computed style per frame) and emits an **agent-ready spec, not code**. A coding
agent then writes the recreation from that spec.

## Layout

- `extension/capture-animation.js` — **THE engine, and the single source of
  truth.** The MV3 extension and the `capture-snippet` DevTools fallback both
  load this one file. Never fork it; edit here and everything follows.
- `extension/` — MV3 wrapper: MAIN-world content script + toolbar element picker
  + service worker (`background.js`).
- `bin/capture-snippet.sh` + `install.sh` — the DevTools-snippet fallback path
  (clipboard the engine into Sources > Snippets) for when the extension can't be
  loaded.
- `skill/codex/` — the Codex skill that drives the full map→capture pipeline.
- `skill/claude/` — the Claude-shaped copy kept for comparison and iteration.

## The engine API (`window.__cap`)

`libs()` (detect animation libraries) · `on(sel)` (track one element) ·
`scan(root)` (report everything that moves under root — robust default) ·
`dump()` (finalize: returns the spec object **and** copies the JSON;
automation uses `dump({copy:false})`) · `pick()`
(toolbar element picker). Output is a *spec* (libraries, summary, per-layer
timing/easing + frame timeline), never code.

## The one rule that shapes everything: capture needs a REAL, VISIBLE browser

Headless/synthetic events do **not** fire framework hover/scroll handlers
(Webflow IX2, GSAP) and the headless compositor may not advance transitions, so
capture yields nothing. This is measured, not theoretical: the same work-card
hover gave **0** moved layers in headless Chrome and **6** in a real, visible
tab.

Consequences the pipeline is built around:
- **Map** (structure / stack / selectors) is fine headless — it's just `evalJS`
  DOM extraction. agent-browser is the cheapest map driver.
- **Capture** (motion) must run in a real, rendered tab driven by real events.
- **Timed-capture recipe** for one-shot transitions:
  **settle → arm (`on`/`scan`) → trigger (real hover/scroll/click) → wait the
  duration → `dump()`**. Arming mid-transition captures nothing.
- **Drive by selector, never coordinates** — captured page coordinates drift
  with viewport; resolve element positions live.

## agent-browser defaults for this repo

This is Martin's trusted local machine. For YoinkIt capture runs, use
the repo wrapper instead of raw `agent-browser`:

```bash
./bin/capture-browser open <url> --headed --init-script extension/capture-animation.js
./bin/capture-browser set viewport 1280 800
```

The wrapper defaults `AGENT_BROWSER_SESSION=yoink`, injects
`--args "--class=claude-mcp"` only on `open` commands for Martin's
Hyprland floating/pinned placement, and passes
`--confirm-actions "" --confirm-interactive false` on every command so one-off
shell exports cannot be lost between tool calls.

Agents should finalize with `__cap.dump({copy:false})` or
`__cap.bootDump({copy:false})`, then save via `window.__capLast` /
`window.__capBootLast`. This avoids browser clipboard permission prompts. Human
extension/snippet use can still call plain `dump()` to copy JSON.

## Driver model (why the skill is structured the way it is)

The pipeline is defined against ~6 browser primitives (`open`, `evalJS`,
`realHover`, `realScroll`, `realClick`, `wait`) so it's driver-agnostic. Each
environment supplies a thin adapter: Codex and Claude can both use
agent-browser for map, then a real visible browser for capture. Minimal setups
can use one real browser (agent-browser `--auto-connect`/`--headed`, or
CDP/Playwright headed) for both. The recipe and manifest schema are identical
across drivers; only the adapter changes. Harness-specific instructions live in
`skill/codex/` and `skill/claude/`.

## Working on the engine

1. Edit `extension/capture-animation.js`.
2. `chrome://extensions` → reload the unpacked extension (↻). Content-script
   edits need the reload; manifest/`background.js` edits too.
3. Drive `__cap` from the page console (or via the skill) to verify.

Keep the engine **framework-agnostic and dependency-free** — it injects into
arbitrary third-party pages, so it must not assume any library or build step.
It's deliberately a single JS file; don't add build tooling without a real need.

## Repo conventions

- Work from a feature branch by default, even for this personal repo. Name it with
  a conventional type prefix matching the work — `docs/`, `feat/`, `fix/`, etc.
  (e.g. `feat/place-first-map`, `docs/product-architecture`).
- Keep commits coherent and semantic.
- Prefer rebase merges for PRs.
- Don't commit local captures (`*.animation.json`) — they're gitignored.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `martinmoradi/yoinkit`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage labels use a small GitHub workflow vocabulary, reusing existing `question`, `help wanted`, and `wontfix` labels where they fit. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. Start with `docs/README.md`, then read the
current docs of record it points to:

- `CONTEXT.md`: project language and glossary.
- `docs/ARCHITECTURE.md`: product shape and pipeline direction.
- `docs/CONTRACT.md`: procedural run contract and Map workbench rules.
- `docs/adr/`: accepted architectural decisions relevant to the work.
- `docs/specs/`: current feature specs when they touch the task.

Treat `docs/archive/legacy-capture-pipeline/` as historical background only. It
is not the current agent contract. See `docs/agents/domain.md`.
