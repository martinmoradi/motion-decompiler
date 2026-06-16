# Driver notes

## For this repo, the tool drives the browser itself

You don't open or drive a browser by hand for the normal pipeline. Every browser
step in `bin/motion-decompile` (map, capture, the repair re-measure, the
`--repair-dump` screenshot + probe) shells out to the repo wrapper
`bin/capture-browser`, which:

- runs `agent-browser` with `AGENT_BROWSER_SESSION=decompile`,
- opens **headed** (`open … --headed`) with the engine injected as an init script,
- adds `--class=claude-mcp` on `open` so Hyprland pins the window to the second
  monitor, and
- disables interactive confirmations on every call.

So the skill just runs the CLI from the repo root and a real, visible browser does
the work. That visibility is **not** optional for capture: headless/synthetic
events don't fire framework hover/scroll handlers (Webflow IX2, GSAP) and the
headless compositor may not advance transitions, so capture comes back empty. Map
is safe headless in principle, but the tool runs it headed too — fine, just slower.

Finalize is handled inside the tool with `dump({copy:false})` / `bootDump`, so no
clipboard-permission prompts.

## The driver-agnostic core (why repairs port across environments)

The pipeline is defined against ~6 primitives — `open`, `evalJS`, `realHover`,
`realScroll`, `realClick`, `wait` — plus `screenshot` for the repair diagnosis
input. Every repair **action** reduces to selector edits + that primitive
vocabulary (`click/hover/scroll/scrollintoview/wait/press/mouse/eval`), and
`repairContext` is one read-only `evalJS` probe. A `precondition_action` is just an
ordinary `beforeAction` array in a different order — nothing in the engine learns
about modals or carousels.

That means the repair contracts (§2/§3) and the recipe are identical no matter who
drives: Claude Code (agent-browser + the tool's own headed capture), Codex (its
in-app Chrome), or a minimal headed CDP/Playwright adapter. Only the thin adapter
under `bin/capture-browser` changes; the skill, the contracts, and `repair-step.js`
don't.

## If you must drive directly (debugging only)

The manual path mirrors the tool's own driving:

```bash
./bin/capture-browser open "<url>" --headed --init-script extension/capture-animation.js
./bin/capture-browser set viewport 1280 800
# … evalJS __cap.scan(...) / realHover / wait / __cap.dump({copy:false}) …
```

Prefer the CLI stages; reach for direct driving only to inspect a single stubborn
capture, and close the session when done.
