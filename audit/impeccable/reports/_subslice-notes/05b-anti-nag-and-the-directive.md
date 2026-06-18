# Subslice 05b Cross-Check Notes

Target: `audit/impeccable/reports/05-hook-system/05b-anti-nag-and-the-directive.md`
Parent context: `audit/impeccable/reports/05-hook-system/05-hook-system.md`
Source root: `/home/martin/src/perso/yoinkit/audit/impeccable/source`

## Executive Delta

- The leaf's main architecture claims are confirmed against canonical source under `skill/scripts/`, not copied provider bundles: line counts, the `ALLOWED_EXTS`/`ACK_EXTS` split, cache schema, per-finding dedup, primary-file edit-count suppression, pending and clean ack rendering, Cursor denial downgrade, and the `hook.pending.json` tombstone are all materially correct.
- Apply three wording corrections before integrating: quiet mode silences all non-fresh emissions, not just pending and clean acks; "no silent fires" needs the implementation exceptions named near the at-a-glance table; and cache persistence plus `.git/info/exclude` maintenance is best-effort, not a hard "can never be committed" guarantee.
- The render-budget section has one overclaim: the footer is preserved during normal line-shedding, but the final hard truncation can cut any part of the assembled message when `maxChars` is too small. The default budget makes this unlikely, but the code does not prove "footer is never dropped."
- The parent overview is broadly aligned with 05b. If the integrator patches 05b's quiet/no-silent wording, mirror the nuance in the overview's anti-nag paragraph so it does not reintroduce the absolute version.
- Citation wrinkle: in this worktree, `audit/impeccable/source` is absent, so source markdown links resolve as missing locally. The same links resolve against the main audit clone at the source root above. Restore or mount the source clone in the integration worktree before doing link-validation as a pass/fail check.

## Corrections To Apply

| Report area | Current claim | Evidence | Suggested change |
|---|---|---|---|
| 05b Section 1, quiet-mode paragraph | "Quiet mode silences #2 and #3 but never #1" and "only the re-nudges and the all-clear acks are optional noise." | `skill/scripts/hook-lib.mjs:1417-1439` emits fresh before quiet, but `:1446-1448` returns quiet before pending (`:1450`), suppression (`:1468`), and clean (`:1484`). Tests cover clean/pending quiet at `tests/hook.test.mjs:928-965`, but there is no separate suppression-under-quiet test. | Say: "Quiet mode silences all non-fresh emissions after the fresh-finding branch, including pending, clean, and the one-shot suppression notice. Fresh findings still emit." If suppression should bypass quiet, that is a source change, not just a report edit. |
| 05b Section 0, Part A table and Section 1 framing | "Every file-scanning fire emits something (fresh / pending / clean)" reads as absolute. | The doc-comment states the policy at `hook-lib.mjs:1180-1200`, and tests confirm pending and clean for UI files at `tests/hook.test.mjs:853-890`. Implementation exceptions are explicit: detector-threw silent at `hook-lib.mjs:1442-1443`, quiet silent at `:1446-1448`, non-UI pending/clean silent at `:1501-1502`, suppressed-after-notice silent at `:1505-1506`; `.ts`/`.js` are outside `ACK_EXTS` at `:51-54` and tests assert no clean/pending ack at `tests/hook.test.mjs:892-925`. | Keep the "presence" thesis, but qualify it as "successful UI-file scans, when quiet is off and edit-count suppression has not taken over, resolve to fresh, pending, or clean output." Then point readers to the ladder for deliberate silent outcomes. |
| 05b Section 2, cache persistence and gitignore | "Persisting the cache and hiding it from git are the same call, so the dedup state can never accidentally get committed." | `persistCache` calls `ensureHookGitExcludes(cwd)` at `hook-lib.mjs:451`, but does not inspect its return value. `ensureHookGitExcludes` catches failures and returns `{ mode: 'error', ... }` at `:496-497`, after which `persistCache` can still create `.impeccable/hook.cache.json` at `:452-453`. | Weaken to "persistCache attempts to maintain `.git/info/exclude` before writing the cache; this is best-effort because the exclude helper fail-opens." If YoinkIt imports the pattern and needs a hard guarantee, check the exclude result before writing. |
| 05b Section 5, render budgets | "The footer is never dropped: clamping sacrifices findings, not the behavioral instruction." | `renderTemplate` and `renderGroupedTemplate` include the footer before budget checks at `hook-lib.mjs:775-784` and `:821-824`. The clamp helpers shed finding lines first (`:841-845`, `:864-868`), but if the message still exceeds `maxChars`, they hard-slice the entire assembled string at `:846-847` and `:869-870`. Test `tests/hook.test.mjs:703-710` only asserts length <= 500, not footer survival. | Replace with: "The budget path tries to preserve the footer by shedding findings first; with the default 8000-char budget it should survive, but the final hard truncation can still cut it under very low `maxChars`." Optionally add a source/test follow-up if footer preservation is a product requirement. |
| Parent overview anti-nag paragraph | The overview correctly summarizes dedup, suppression, loop-breaker, and `ACK_EXTS`, but inherits the compact "clean/pending ack keeps discipline in context" language. | Overview lines `323-342` match the source in broad strokes. The same exceptions above matter because the overview is the entry point a later agent reads first. | Add one sentence after the anti-nag bullets: "The ladder still has deliberate silent outcomes: detector errors, quiet mode, non-UI ack extensions, and post-notice suppression." |
| `hook.pending.json` references | 05b already corrects the old active-state claim; `skill/reference/hooks.md` still says reset deletes a "Cursor pending queue." | `getPendingPath` exists at `hook-lib.mjs:126-128`; ignore patterns include it at `:83-87`; reset deletes it at `hook-admin.mjs:595`; live ignore patterns include it at `skill/scripts/live-inject.mjs:33-35`; smoke/test evidence reads it. The live denial state is `cursorDenials` in `hook.cache.json` at `hook-before-edit.mjs:357-362`. `skill/reference/hooks.md:28` still uses the stale wording. | Keep 05b's tombstone section. In the 05d integration pass, patch `hooks.md:28` to say reset deletes hook config and state files, including the cache and any legacy pending tombstone, not a live Cursor pending queue. |

## Deep Implementation Notes

- Confirmed line counts from canonical source: `skill/scripts/hook-lib.mjs` is 1526 lines, `skill/scripts/hook-before-edit.mjs` is 476, `skill/scripts/hook-admin.mjs` is 636, and `skill/reference/hooks.md` is 90. Parent overview line-count rows match. Additional checked counts: `cli/lib/impeccable-config.mjs` 638, `scripts/lib/transformers/hooks.js` 120, `scripts/lib/transformers/providers.js` 122, `scripts/build.js` 794, `cli/bin/commands/skills.mjs` 1818, `cli/engine/detect-antipatterns.mjs` 50.

- Confirmed extension model: `ALLOWED_EXTS` includes `.tsx`, `.jsx`, `.html`, `.htm`, `.vue`, `.svelte`, `.astro`, `.css`, `.scss`, `.sass`, `.less`, `.ts`, `.js` at `hook-lib.mjs:46-49`. `ACK_EXTS` removes `.ts` and `.js` at `:51-54`. `shouldEmitAckForFile` is a direct extension lookup at `:1221-1223`. Tests lock this at `tests/hook.test.mjs:1264-1283`.

- Confirmed default config shape: `DEFAULT_CONFIG` includes `enabled`, `quiet`, `auditLog`, `designSystem:{enabled:true}`, `ignoreRules`, `ignoreFiles`, `ignoreValues`, and `limits:{maxFindings:5,maxChars:8000}` at `hook-lib.mjs:72-81`. `readConfig` reads shared then local config at `:137-148`; tests cover shared/local merge at `tests/hook.test.mjs:156-198` and malformed config fallback at `:200-220`.

- Confirmed cache lifecycle with one nuance: `readCache` defaults to `{version:1,sessions:{}}` when the file is malformed or wrong-version at `hook-lib.mjs:425-433`. `persistCache` keeps the newest 8 sessions by `updatedAt` at `:436-448`. It then attempts `ensureHookGitExcludes` and writes the JSON at `:449-453`. Because the exclude helper returns error objects instead of throwing, the "never committed" claim is an inference that the code does not fully enforce.

- Confirmed dedup key: `extractFindingIgnoreValue` only value-keys `overused-font`, `bounce-easing`, `design-system-font`, `design-system-color`, and `design-system-radius` at `hook-lib.mjs:655-666`. `findingCacheKey` prefers `antipattern:line:value`, falls back to `antipattern:line`, then `antipattern:0:value`, then an 80-character snippet, at `:748-755`. `dedupeAgainstCache` builds a known-key set and returns only unknown findings at `:726-738`; `rememberFindings` persists only the fresh keys at `:740-746`. Tests cover the cache demotion behavior at `tests/hook.test.mjs:853-875`.

- Confirmed pending route: after detection and filtering, fresh findings are remembered and grouped at `hook-lib.mjs:1391-1399`. If filtered findings remain but are all cached, `pendingWinner` captures the file and cached key strings at `:1407-1409`; `renderPendingAck` samples the first three keys and adds a `+N more` suffix at `:1211-1218`. Tests cover the exact pending text at `tests/hook.test.mjs:1296-1309`.

- Confirmed edit-count suppression: `bumpEditCount` increments per `(session,file)` at `hook-lib.mjs:551-556`. `runHook` calls it only for `primaryFileSet` members at `:1367-1370`; co-scanned stylesheets do not accrue edit counts, confirmed by `tests/hook.test.mjs:1546-1573`. Suppression arms only when `editCount === EDIT_COUNT_THRESHOLD + 1` at `hook-lib.mjs:1371-1375`, then later emits `suppressionNotice` at `:1468-1481`. Tests cover silent edit 8 at `tests/hook.test.mjs:1150-1166` and threshold notice text at `:1168-1180`.

- Confirmed emission ladder, exact order: fresh grouped render at `hook-lib.mjs:1417-1439`; detector-threw-only silent at `:1442-1443`; quiet silent at `:1446-1448`; pending ack if `ACK_EXTS` at `:1450-1465`; suppression notice at `:1468-1481`; clean ack if `ACK_EXTS` at `:1484-1498`; non-UI ack silent at `:1501-1502`; suppressed-hit silent at `:1505-1506`; last-skip silent at `:1509`. This order is the best single source for any prose patch.

- Confirmed render path: `renderTemplate` caps findings with `limits.maxFindings`, appends a directive footer, and calls `clampToBudget` only after assembly exceeds `maxChars` at `hook-lib.mjs:758-787`. `renderGroupedTemplate` uses one shared `shownCount` budget across files at `:789-827`. The grouped clamp and single-file clamp shed lines first, then hard truncate at `:829-873`. Tests cover max-findings and directive content at `tests/hook.test.mjs:630-665`.

- Confirmed directive footer semantics: the source comment names the three moves at `hook-lib.mjs:1241-1253`; the returned body has the imperative handling instruction, context-judgment clause, acknowledgement instruction, no source comments, user-confirmed ignore persistence, narrowest exception, overused-font special case, and `/impeccable audit` at `:1254-1266`. Tests assert the imperative, judgment, ignore guidance, and audit text at `tests/hook.test.mjs:642-665`.

- Confirmed design-system note rides only on normal emitted messages, not suppression: `appendDesignSystemNote` is called for fresh at `hook-lib.mjs:1419`, pending at `:1451`, and clean at `:1485`. Suppression uses `suppressionNotice` directly at `:1469`, so a stale design sidecar will not piggyback on suppression output. The leaf already says fresh/pending/clean, so no correction is needed, but keep that precision.

- Confirmed Cursor loop-breaker: `hook-before-edit.mjs` projects proposed content and fail-opens on fragment/missing/unreadable content at `:84-141` and `:401-406`. `findingSignature` sorts `antipattern:line` pairs without values at `:344-349`. `bumpCursorDenial` stores counts under `fileEntry.cursorDenials[key]` in the shared cache at `:351-362`. The pre-write hook allows on count 7 because it increments then checks `denial.count > EDIT_COUNT_THRESHOLD` at `:442-458`; otherwise it denies at `:460-468`. Test coverage is explicit at `tests/hook.test.mjs:1855-1884`.

- Confirmed fail-open entry points: post-edit `hook.mjs` snapshots inherited env before setting `IMPECCABLE_HOOK_DEPTH` at `hook.mjs:25-30`, calls `runHook`, writes audit, and exits `result.exitCode || 0` at `:35-44`; its top-level catch exits 0 at `:47-60`. Cursor `hook-before-edit.mjs` says the same contract in the header at `:9-10`, uses `allow()` for malformed/skipped paths, and its top-level catch returns `{permission:"allow"}` at `:471-475`.

- Confirmed `hook.pending.json` tombstone: no canonical writer was found under `skill/`, `cli/`, or `scripts/` outside generated/hidden provider bundles. The live references are path definition `hook-lib.mjs:126-128`, ignore patterns `:83-87`, live ignore patterns `skill/scripts/live-inject.mjs:33-35`, reset deletion `hook-admin.mjs:595`, and smoke/test reads. The active Cursor loop-breaker state is `cursorDenials` in `hook.cache.json`.

## Paradigms Worth Importing

- Steal the demote-and-remember cache pattern for YoinkIt coverage findings. A coverage key like `uncaptured-motion:<selector>:<trigger>` should stop being "fresh" after the first reminder but remain in session state so a cheap pending ack can keep it visible.

- Steal the intervention counter, not necessarily the exact trigger. Impeccable counts file edits for advisory suppression and identical finding signatures for blocking downgrades. YoinkIt should count capture attempts or "done" assertions per surface/signature, then back off or yield at a fixed threshold.

- Adapt the `ACK_EXTS` idea to "surfaces where positive coverage chatter matters." For YoinkIt, the positive ack should probably be gated to pages/components with a known motion surface or capture manifest, not every file the agent edits.

- Retarget the directive footer almost verbatim: imperative capture instruction, a judgment clause that says not every moving element needs a spec, and a requirement to tell the user what was captured or intentionally skipped. This matters because hook output is hidden developer context.

- Do not import the assumption that checks are cheap. Impeccable can scan text/static HTML on every edit. YoinkIt's ground truth requires a real visible browser, so the expensive probe should be evented or user-triggered; subsequent anti-nag reminders should be cache-backed.

- If YoinkIt persists local hook/coverage state, treat `.git/info/exclude` maintenance as a failure mode. Either document it as best-effort, like Impeccable effectively is, or make the state write conditional on confirmed local exclusion when accidental commit risk is unacceptable.

## Link And Citation Checks

- Resolver status: running `node skill/subslice/scripts/resolve-subslice.mjs 05b` from this worktree failed because `audit/impeccable/source` is missing. Running the same resolver from `/home/martin/src/perso/yoinkit` resolved the expected leaf, parent, source root, and note path. This note therefore uses the main checkout's source clone for verification and writes only into the current worktree's note path.

- Markdown sibling links in 05b are valid in the current worktree: `05-hook-system.md`, `05a-hook-models-and-runtime-core.md`, `05c-config-and-ignore-model.md`, and `05d-admin-cli-and-contract.md` all exist.

- Markdown source links in 05b and the parent are broken if checked relative to the current worktree because `audit/impeccable/source` is absent. The same linked paths exist under `/home/martin/src/perso/yoinkit/audit/impeccable/source`: `skill/scripts/hook-lib.mjs`, `skill/scripts/hook-before-edit.mjs`, `skill/scripts/hook.mjs`, `skill/scripts/hook-admin.mjs`, `skill/reference/hooks.md`, `.impeccable/config.json`, `cli/lib/impeccable-config.mjs`, `skill/scripts/lib/impeccable-paths.mjs`, `skill/scripts/lib/is-generated.mjs`, `scripts/lib/transformers/hooks.js`, `scripts/lib/transformers/providers.js`, `scripts/lib/transformers/factory.js`, `scripts/build.js`, `cli/bin/commands/skills.mjs`, `cli/engine/detect-antipatterns.mjs`, `.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`, and `plugin/hooks/hooks.json`.

- The important source anchors in 05b still land on the intended symbols. Exact line refs confirmed for `readCache:425`, `findingCacheKey:748`, `bumpEditCount:551`, `ACK_EXTS:51`, `renderCleanAck:1205`, `renderPendingAck:1211`, `shouldEmitAckForFile:1221`, `directiveFooter:1254`, `runHook` ladder `1417-1509`, and `hook-before-edit` loop-breaker `344-460`.

- `skill/reference/hooks.md:28` is still stale about a "Cursor pending queue." This is not a 05b error because 05b explicitly flags it, but the integration sweep should patch the referenced contract doc or leave a cross-slice TODO for 05d.

## Open Questions

- Is quiet mode intentionally supposed to suppress the one-shot edit-count suppression notice? The current source does. If yes, only docs need a wording patch. If no, add a test and move the suppression branch above quiet.

- Should the render footer be a hard invariant? If yes, `clampToBudget` and `clampGroupedToBudget` need a different final fallback and tests that assert the directive survives low `maxChars`.

- Should integration restore `audit/impeccable/source` into this worktree before final link validation, or should the audit reports document that source links are clone-dependent and may be absent in lightweight worktrees?
