# Subslice 03e Cross-Check Notes

Target: `audit/impeccable/reports/03-live-mode/03e-manual-edit-round-trip.md`
Parent context: `audit/impeccable/reports/03-live-mode/03-live-mode.md`
Source root: `/home/martin/src/perso/yoinkit/audit/impeccable/source` (resolver-relative `audit/impeccable/source`; the ignored clone is absent in this worktree but present in the primary checkout)

## Executive Delta

- The report is broadly correct on the manual-edit pipeline: inline editor -> stash buffer -> evidence builder -> commit verifier -> rollback/repair -> clear-only-verified. The important line anchors in `live-browser.js`, `manual-edits-buffer.mjs`, `live-manual-edit-evidence.mjs`, `live-commit-manual-edits.mjs`, and `live-copy-edit-agent.mjs` match current source.
- Main correction: the report and parent overview overstate that manual Apply is exclusively a separately spawned `codex`/`claude` subprocess. Source supports two Apply backends. In `chat` mode, and in `auto` when `chatAgentLikelyActive()` is true, `/manual-edit-commit` dispatches a server-created `manual_edit_apply` event to the existing poll agent via `manualApply.pushBatchInChunksAndWait`.
- Because of that, the report's claim that `live-poll.mjs`'s `manual_edit_apply` handling is vestigial is wrong. `/events` still rejects browser-submitted `manual_edit_apply`, but server-enqueued `manual_edit_apply` events are live and tested.
- Smaller corrections: the route surface includes `GET /manual-edit-stash`, the removed `POST /manual-edit` 410 path is not token-gated, "5 strategies + Astro hint" should be "five strategies total, one of which is Astro `sourceHint`", and post-apply syntax checks are narrower than "framework files" implies.

## Corrections To Apply

| Report area | Current claim | Evidence | Suggested change |
|---|---|---|---|
| 03e intro, overview table, parent overview line 36/46, §3 "The seam", surprises | Manual edit Apply is a "freshly spawned `codex`/`claude` process" and "the live apply path is exclusively the spawned subprocess"; `live-poll.mjs:25` is called vestigial. | `skill/scripts/live/manual-edit-routes.mjs:151-183` selects `useChatRoute` when `IMPECCABLE_LIVE_COPY_AGENT=chat` or `auto && chatAgentLikelyActive()`, then calls `commitManualEdits` with `provider:'chat'` and `applyBatchToSource: manualApply.pushBatchInChunksAndWait`. `skill/scripts/live/manual-apply.mjs:35-78` creates a `manual_edit_apply` event and enqueues it. `skill/scripts/live-poll.mjs:25,40-47,231-233,315-322` treats `manual_edit_apply` as a real agent-reply event. `skill/reference/live.md:50-61,528-538` documents the poll-loop handler. `tests/live-server.test.mjs:470-580` has an explicit "routes through the chat agent poll loop when configured" test. | Reframe as: manual edit has a separate stash/commit/buffer/transaction machine, but Apply can use either an existing chat poll agent (`manual_edit_apply`) or a spawned subprocess (`codex`/`claude`/`mock`). Keep the useful "separate from browser `/events` and session journal" seam, but remove "exclusively spawned" and "vestigial" language. |
| Parent overview §4.2 "two agent models" | The variant loop uses the harness poll agent; the manual-edit loop spawns a fresh subprocess. | Same evidence as above, plus `tests/live-poll.test.mjs:44-53,62-70,132-137` asserts manual Apply guidance, `--data` parsing, and `requiresAgentReply({type:'manual_edit_apply'}) === true`. | Say there are two manual Apply backends: chat/poll for active live sessions and subprocess for local CLI runner fallback. The trust posture still differs because manual Apply remains server-verified and buffer-backed. |
| 03e route section | "`createManualEditRoutes` returns one handler for four routes. All are token-gated." | `skill/scripts/live/manual-edit-routes.mjs:34-75` POST stash, `:78-91` GET stash, `:94-250` POST commit, `:252-286` repair decision, `:288-329` discard, `:331-333` removed POST `/manual-edit` 410. The 410 path returns before any token check. | List five active token-checked method/path handlers plus the legacy 410 path: `POST /manual-edit-stash`, `GET /manual-edit-stash`, `POST /manual-edit-commit`, `POST /manual-edit-repair-decision`, `POST /manual-edit-discard`; `POST /manual-edit` is a removed endpoint returning 410. |
| 03e file map, evidence wording | "`live-manual-edit-evidence.mjs` builds per-op source candidates (5 strategies + Astro hint)." | `skill/scripts/live-manual-edit-evidence.mjs:132-144` returns exactly five candidate fields: `sourceHint`, `textMatches`, `objectKeyMatches`, `locatorMatches`, `contextTextMatches`; `:156-187` shows `sourceHint` is the Astro hint analysis. | Change to "five strategies total: Astro `sourceHint`, literal text, object key, locator, and context text." |
| §7.5 post-apply syntax checks | "framework files get a lightweight syntax scan" could read as Astro/Svelte/Vue/HTML parsing. | `skill/scripts/live-copy-edit-agent.mjs:137-183` checks leftover markers, JSON parse, `node --check` for `.mjs/.cjs/.js`, and custom validation script. `checkFrameworkSourceSyntax` at `:185-211` only attempts Babel parsing for `.jsx`, `.tsx`, and `.ts`; it returns null for `.astro`, `.svelte`, `.vue`, and `.html`. Tests cover invalid JS, JSX, JSON, and leaked markers in `tests/live-copy-edit-agent.test.mjs:87-126` and `tests/live-commit-manual-edits.test.mjs:1312-1320`. | Tighten to: post-apply checks parse JSON, run `node --check` on JS-family files, run Babel parse for JS/TS/JSX/TSX when available, scan for leftover Impeccable markers, and run `scripts.impeccable:manual-edit-validate` when defined. Do not imply Astro/Svelte/Vue/HTML syntax parsing unless a project validation script supplies it. |

## Deep Implementation Notes

- Confirmed inline editor details:
  - `live-browser.js:3189-3190` declares `inlineEditRows` and `inlineEditDrafts`.
  - `collectEditableTextRows` is at `:3199-3239`; it only emits rows whose direct children are all text nodes and contain non-whitespace.
  - `wrapMixedContentTextNodes` is at `:3241-3265`; it wraps non-whitespace direct text nodes in `span[data-impeccable-text-wrap=true]` when an element has both text and element children, while skipping `script/style/template/noscript/svg/code/pre` via `MIXED_WRAP_SKIP` at `:3197`.
  - `enableInlineEdit` at `:3279-3297` freezes `whiteSpace`, sets `contenteditable`, writes `data-impeccable-original-text`, and wires `onInlineInput`; `disableInlineEdit` at `:3299-3317` removes the state and unwraps unless told to preserve wrappers.
  - `applyEditing` at `:3583-3645` enforces non-empty text and the `< { } \`` gate, builds ops with locator/leaf/nearby/restore/sourceHint, assigns `contextRef` and `container`, and POSTs to `/manual-edit-stash`.
- Confirmed sanitizer behavior:
  - `stripManualEditRuntimeState` at `live-browser.js:867-888` unwraps mixed-content markers on a clone and removes edit-mode attributes/styles.
  - `sanitizedContextOuterHTML` at `:890-895` clone-then-strips before serialization.
  - The prompt compacting path also strips leaked runtime attributes from agent payloads; see `tests/live-commit-manual-edits.test.mjs:1280-1309`.
- Confirmed server-side text gate:
  - `event-validation.mjs:17-26` defines the same forbidden char set.
  - `validateManualEditEvent` at `:69-92` rejects malformed ops, empty `newText`, and forbidden chars.
  - `/manual-edit-stash` calls `validateEvent({...msg, type:'manual_edits'})` before `stageManualEditEntry` at `manual-edit-routes.mjs:47-58`.
- Confirmed buffer correctness anchor:
  - `manual-edits-buffer.mjs:64-103` merges by same `pageUrl` and `op.ref`, refreshes `newText`, and preserves `originalText` from the existing op at `:73-79`.
  - `removeEntries`, `countByPage`, and `truncateBuffer` are at `:111-152`; removed counts are op counts, not entry counts.
- Confirmed evidence module shape:
  - `live-manual-edit-evidence.mjs:39-72` reads the buffer, filters by page, flattens ops, scans source once, and returns `entries`, `ops`, `context`, and `candidates`.
  - `collectSearchFiles` at `:208-258` scans `src/app/pages/components/public/views/templates/site/lib/data`, text-ish extensions only, skips generated files and build directories, uses realpath de-duping, and includes root-level files.
  - `buildContextHintsByRef` at `:108-129` enriches nearby texts with element text chunks and, if present, `data-impeccable-original-text` snippets from `entry.element.outerHTML`.
- Confirmed commit verification:
  - `commitManualEdits` starts at `live-commit-manual-edits.mjs:901`; it snapshots apply-owned files at `:944-945`.
  - `verificationTargetsForOp` at `:267-308` combines op hint, candidate hint, text/object/locator/context matches, sibling candidates, and reported-file locator matches.
  - `verifyAppliedEntry` at `:458-510` independently verifies each op and applies the coupled object-key guard from `:339-358`.
  - `findUnappliedEntrySourceChanges` at `:518-544` detects leaked source changes for entries not reported applied.
  - `clearAppliedEntries` at `:555-570` removes only verified ids from the buffer.
  - Repair loop is `repairPostApplyValidation` at `:763-899`, with `DEFAULT_REPAIR_ATTEMPTS = 3` at `:63`.
- Confirmed transaction and chat Apply mechanics:
  - `manual-apply.mjs:7-9` defines hard timeout 150s, soft deadline 120s, and default chunk size 3.
  - `manual-apply.mjs:35-78` writes per-event evidence, creates `manual_edit_apply`, records a deferred, and enqueues it.
  - `manual-apply.mjs:81-156` chunks chat Apply batches and aggregates results.
  - `manual-apply.mjs:726-817` writes/clears/rolls back `manual-edit-apply-transaction.json`.
  - `manual-apply.mjs:497-581` validates manual Apply replies; malformed replies do not clear the staged buffer.

## Paradigms Worth Importing

- Keep the report's strongest YoinkIt transfer: "producer is untrusted, verify the artifact before reporting done." For YoinkIt, this maps better to spec validation than file rollback. After `dump()`, verify claimed layers/timelines/final values inside the emitted spec and report only verified captures.
- Preserve the literal-data framing. `live-copy-edit-agent.mjs:38-67` is a useful prompt-security pattern for YoinkIt: page text and human labels are data, not instructions, and engine/editor scaffolding is forbidden output.
- Import the "active chat route" lesson too. The chat-mode manual Apply path shows how to keep the foreground agent loop involved without putting the browser on a raw `/events` write path: server-created, leased work item; bounded compact payload; structured reply; independent verification.
- The buffer keep-original rule transfers cleanly to any future YoinkIt "edit captured spec before finalizing" queue: stable key + first baseline pinned + latest draft refreshed.

## Link And Citation Checks

- Report-to-report links in the leaf and parent resolve inside this worktree: `03-live-mode.md`, `03a`, `03d`, and `03f` are present.
- Source links under `../../source/...` do not resolve in this worktree because `audit/impeccable/source/` is gitignored and absent here. The same source root exists in the primary checkout at `/home/martin/src/perso/yoinkit/audit/impeccable/source`; all source evidence above was verified there.
- File-map line counts in the leaf are confirmed against canonical source: `live-browser.js` 11161, `manual-edit-routes.mjs` 357, `manual-edits-buffer.mjs` 152, `live-manual-edit-evidence.mjs` 363, `live-commit-manual-edits.mjs` 1241, `live-copy-edit-agent.mjs` 683, `manual-apply.mjs` 939, `live-discard-manual-edits.mjs` 51, `event-validation.mjs` 137, `live-server.mjs` 1134.
- Important line anchors verified: `sourceHintForElement` `live-browser.js:3450`, `copyEditLeafContext` `:3529`, `nearbyEditableTextsForManualEdit` `:3543`, `mixedTextWrapRestoreHint` `:4208`, `restoreMixedTextNodeManualEdit` `:4219`, `live-server.mjs` direct `/events` rejections at `:673-680`, and post-apply reply handling at `live-server.mjs:824-856`.

## Open Questions

- Should the final integrated report treat chat-mode manual Apply as part of the "manual-edit loop" deep dive, or should some of that discussion move to 03a because it reuses the long-poll transport? My recommendation: keep it in 03e, with a cross-link to 03a, because the buffer/transaction/verification semantics live here.
- If the report wants to call the manual loop "not journaled," clarify that server-created `manual_edit_apply` events may still be visible to the poll/status machinery and `session-store.mjs` has a `manual_edit_apply_requested` case, but browser stash/commit durability is the buffer/transaction, not the variant session journal.
