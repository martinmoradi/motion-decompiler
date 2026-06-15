# motion-decompiler — execution roadmap

This is a PM/CTO roadmap, not a spec. Each **Part** below is a self-contained
prompt you drop into a **clean context** (a fresh agent). You run one part, the
agent reports back, and the roadmap gets adjusted before the next part. The
parts are ordered by leverage and dependency, but Parts 1 and 2 are independent
and can be done in either order.

The working model:
- The engine and planner are edited by clean-context agents, one part at a time.
- Every behavior change is justified by one number: **live-capture hit rate**,
  measured by the Part 0 harness. If a part does not move a bucket, that is a
  finding, not a polish item.
- Capture needs a real, visible browser (see `CLAUDE.md`). Map/scout is fine
  headless.

---

## Why this roadmap exists (the read)

The tool is really two tools, and only one is the product:

- **The map** (static analysis: GSAP/ScrollTrigger registry, CSS `@keyframes`,
  CSS transitions, structural split-reveal detection) carries everything. On
  flowfest, 46 of 48 animations came from the map. On ashleybrookecs, 79
  ScrollTriggers came straight from the registry. This half is precise, honest
  (measured vs verify), and generalizes. It is the moat.
- **Live capture** (drive real events, sample per frame) succeeds about **a
  third of the time**: roughly 8 clean `ok` out of ~28 attempted captures across
  the four calibration sites. Its failures are **not random**. They collapse
  into a small set of named, repeating causes.

So the work splits cleanly: a finite batch of **deterministic engine/planner
fixes** (Parts 1 through 4) raises the floor, and then **one specific LLM layer**
(Part 5, a diagnose-and-retry repair loop) handles the genuinely hard residual.
The LLM must never measure motion. The engine's per-frame sampling and its
measured-vs-verify honesty stay the source of truth. The intelligence goes into
**targeting and repair**, not measurement.

### Failure taxonomy (the backlog, distilled from the 4 calibration runs)

| # | Failure mode | Hit on | Kind | Owner | Part |
|---|---|---|---|---|---|
| A | Decompiled the wrong document (cross-origin iframe / embed shell) | vwlab (5/5 fail) | Deterministic | Engine/map | 1 |
| B | Pseudo-element hovers invisible (`::after` underline = scaleX / bg-size) | flowfest, enerblock, ashley | Deterministic | Engine | 2 |
| C | Split-reveal routed to boot, fires on scroll | flowfest (boot empty), ashley (boot latched onto reflow) | Deterministic | Planner | 4 |
| D | Occluded / hidden-until-interaction / inert representative | all 4 | Partly det., partly LLM | Planner + repair | 4 + 5 |
| E | Accordion clicks the body, not the header/icon | flowfest, residual Mammoth | Deterministic | Planner | 4 |
| F | Vendor keyframes ranked as #1 signature (Shop Pay skeleton) | vwlab | Deterministic | Ranking | 3 |
| — | Cosmetic: "scroll target" mislabel (`bin/motion-decompile:816`), drawSVG one-row-per-path, readiness false-positives | flowfest, vwlab | Deterministic | Trivial | 3 |

Confirmed in code: iframe has **zero** mentions in engine or planner;
pseudo-elements are **never** sampled (engine reads 9 properties off the element
only, `capture-animation.js:478`, PROPS at lines 34-35); vendor filtering is
**zero**. The planner (`bin/motion-decompile`, ~2294 lines) is larger than the
engine (~1306 lines), so most of today's "intelligence" is hand-coded heuristics.

The **Mammoth overfit** is deliberately not on this roadmap. It is confirmed
inert across all four sites (additive dead weight, not distorting). Touch it only
if it actually mis-fires on a sibling Webflow site.

### Success metric

Two numbers, not one. The lever is **live-capture hit rate** (baseline 28.6%, 8
ok of 28 attempted; usable 35.7% counting checks). But the true north is the
**rebuild verdict**: flowfest is only 11% hit yet ships 48 animations (32
measured) from the ScrollTrigger registry and is a usable rebuild. The
map-derived spec is the product. Do not sacrifice spec richness to chase hit%.

Caveat the baseline exposed (2026-06-15): the failure-cause histogram was partly
fiction, because distinct root causes shared one vague reason string.
`wrong_document_iframe` read 0 but was 5; `pseudo_element` and
`wrong_trigger_boot_vs_scroll` read 0 but were hiding inside `hidden_not_visible`
(9, of which 5 are really vwlab's iframe) and `inert_representative` (6). Part 1
makes it honest. Note also that the scoreboard measures failures and spec counts,
not spec QUALITY, so a few fixes (vendor de-rank, drawSVG grouping) are verified
by inspection, not by a moving number.

Each behavior part ends by re-running the Part 0 harness and reporting the diff.

---

## Status (progress log)

- **Part 0 — done** (f07456f, 6b24eab, da12268). Standing harness + extractor +
  2026-06-15 baseline: 28.6% hit (8/28), 35.7% usable.
- **Part 1 — done** (00691fa iframe detect/flag/re-target, bffe631 `cause`
  classifier, 199ece9 extractor reads `cause`).
  - Histogram is now honest: the 3 generic `inert_representative` split into +2
    `pseudo_element`, +1 `wrong_trigger_boot_vs_scroll`.
  - **Prizes sized:** `pseudo_element` = 2 (flowfest underline-link, enerblock
    link--underline) -> Part 2. `wrong_trigger_boot_vs_scroll` = 1 (flowfest
    boot-load-reveals) -> Part 4 (on top of Part 4's accordion + boot-reflow
    fixes). Projected stable-site lift from Parts 2 + 4: ~35% -> ~52%.
  - iframe threshold: visible iframe >= 60% of viewport AND larger than the top
    doc's biggest real-content block; secondary thin-doc signal.
  - **vwlab drifted:** it is no longer a cross-origin shell, so the iframe case
    cannot reproduce live. The cross-origin pipeline is now guaranteed by a
    permanent two-port smoke fixture instead, which is better than a drifting
    live URL.
  - **Decision (open item resolved): keep-and-label, do not fully suppress shell
    captures.** We need the labels for honest cause counts; the "don't mislead a
    rebuild agent with chrome" concern is handled by the report leading with the
    re-target finding plus Part 3's vendor de-rank, without special-casing.
    Revisit with full planner suppression only if embed-shells prove common.
- **Methodology rule (from the vwlab drift):** the standing set is live
  third-party URLs and will change. Correctness guarantees live in fixtures (done
  for iframe). The live set is for breadth; re-baseline a site when it changes
  and never compare across the change. Open: re-baseline vwlab as whatever it now
  is, and decide keep-or-swap once we see it.
- **Part 2 — done** (4c34a67 pseudo-element sampling). The engine now samples
  `::before`/`::after` as their own tracks (`<sel>::after`), gated on a content
  existence probe; scan mode diffs a bounded pseudo set (cap 1500) so per-frame
  getComputedStyle volume never grows with the tree. Also added `background-size`
  to the sampled props and kebab transition-property matching in `cssTiming` so
  multi-word props get authoritative timing.
  - **Prize claimed (headed verify):** both `pseudo_element` captures flip empty
    -> captured. flowfest `div.underline-link::before` = scaleX 0->1 @0.5s
    cubic-bezier(.625,.05,0,1) (31 frames); enerblock
    `a.link--underline::before` = scaleX 0->1 @0.3s ease (19 frames). Both read
    the authoritative CSS transition off the pseudo, not "measured".
  - Perf: single mode adds +2 reads per tracked node/frame (sub-ms); scan one-
    time existence probe ~4ms on a 1.2k-element page (210 pseudo-bearing),
    per-frame pseudo pass proportional to that subset. No element-capture
    regression; smoke green (20/20).
  - Spec-correctness artifact (pre-existing, not pseudo-specific): a `scaleX(0)`
    rest matrix decodes to `rotate 90->0deg` alongside `scale 0->1` (flowfest);
    degenerate-matrix decode in `decodeTransform`. Promoted to Part 2.5 because
    Part 2 made scale-from-zero a common captured case, so it now corrupts those
    specs (a rebuild agent would add a rotation that isn't there).
- **Part 2.5 — done** (`decodeTransform` degenerate-axis guard). When a
  decomposed scale axis falls below `COLLAPSED_AXIS_EPS = 1e-3` the column is
  rank-deficient, so the rotation read off it is float noise: the 2D branch now
  reports `rotate 0` instead of the `atan2` result, and the 3D branch suppresses
  only the Euler components read off the collapsed column (rotateY/rotateZ from
  the X column, rotateX from the Y/Z columns). Non-degenerate decode is
  unchanged.
  - **Headed verify (flowfest `div.underline-link::before`):** rest matrix is
    `matrix(0, 1.74533e-05, 0, 1, 0, 0)` (scaleX ~ 1.7e-5). Before: decoded to
    `{scaleX:0, scaleY:1, rotate:90}`, so the track read `rotate 90->0` next to
    `scale 0->1`. After: `{scaleX:0, scaleY:1, rotate:0}` at both ends. The
    rotate row is gone; the track is a clean `scale 0->1` @0.5s.
  - Guard only fires on a truly collapsed axis: `matrix(0,1,-1,0,0,0)` still
    decodes to `rotate 90`, and a 0.01-scale 45deg rotation still decodes to 45.
    New unit test `tests/decode-transform.test.js` (browser-free, wired into the
    smoke suite) covers both directions; smoke green. No Part 0 metric change
    expected (spec-correctness fix; hit% unaffected).
- **Part 4 — done** (c587d4a recipes, fb7cd68 tests). Three structural fixes,
  no per-site literals: (a) split reveals on a ScrollTrigger stack plan as
  individual `scroll-reveal` captures instead of one premature boot capture;
  (b) reveal lead prefers transform/opacity and flags text-fragment width/height
  reflow as noise; (c) accordion planning targets the visible header/toggle
  (derives candidate toggle selectors from the body selector, scores header/icon
  over the collapsible panel). node --check both files; smoke green with new
  browser-free fixtures pinning all three (split routing, the
  `item-bottom-content` -> `item-top` synthesis, the reflow-noise note).
  - **Headed before/after:**
    - flowfest accordion: was clicking `div.accordion-css__item-bottom-content`
      -> occlusion error. Now clicks `div.accordion-css__item-top` -> **ok, 7
      findings** (icon rotation + panel height). A clean error->ok flip.
    - ashley boot reveal: was reporting text reflow (width 145.5->134.7px). Now
      reports the real reveal (transform y 0->-102px) and notes 89 width/height
      reflow findings ignored. **Quality win invisible to hit%** (the capture was
      already counted ok; its CONTENT was poisoned, exactly the pattern Part 2.5
      flagged).
    - flowfest split reveals (speakers/community grid-lines): correctly re-routed
      to `scroll-reveal` but still 0 findings. Codex inspected the live DOM and
      found no measurable transform/opacity/clip/size motion on the hosts. This
      is **site drift (correctly-routed-empty), not a recipe miss** -- same class
      as the vwlab drift. The scroll-reveal path itself is validated by the new
      ok/check captures in the granular split set, not by this inert named case.
  - **Part 0 numbers (from Codex's Part 4 verification run):** baseline 28 att /
    8 ok / 2 check (28.6% hit, 35.7% usable) -> 41 att / 12 ok / 5 check (29.3%
    hit, 41.5% usable). **The +0.7pp hit delta is an artifact -- do not read it
    as the result.** The denominator grew 28 -> 41 because each split host is now
    its own scroll capture. Per methodology rule (never compare across the
    change), hit% is no longer apples-to-apples with the 28-baseline. Honest read:
    **+4 ok, +3 check in absolute terms**, and of the 13 new granular split
    captures 7 are usable (~54% yield, ABOVE the baseline rate) -- healthy
    granularization, not denominator padding. **41 is the new baseline
    denominator.**
  - **Open follow-ups (not blockers):**
    1. Codex left the work uncommitted and did NOT update `SCOREBOARD.md`/per-site
       notes. PM reviewed + committed the source and tests. The scoreboard still
       shows the 28-baseline; it needs a clean Part 0 re-baseline run to record
       the 41-denominator numbers (do not hand-edit the scoreboard from a verbal
       report).
    2. Split-host granularity: confirm the per-host scroll captures enrich the
       spec rather than fragmenting one staggered reveal into up to 12 rows
       (12-host cap). Check on the next Part 0 run by reading a couple of the new
       split captures, not just the count.
    3. Accordion selector synthesis is generic but a bet (it guesses
       `item-top`/`-header` exist from the body selector). Pinned by the smoke
       fixture; watch it on the next real Webflow accordion before trusting it
       broadly.
- **Next:** Part 3 (browser-free sweep: vendor de-rank + drawSVG grouping +
  the hover/click label-bug fix; low risk, no browser, clears the last
  deterministic items). Then a clean Part 0 re-baseline that also re-baselines
  vwlab as whatever it now is (and decides keep-or-swap / add
  report-vwlab.netlify.app), establishing the 41-denominator scoreboard. Then
  Part 5 (repair-loop DESIGN checkpoint) for the genuine residual: modal-only
  elements, real occlusion (carousel arrow, stack-card), hidden inner
  affordances.

---

## Part 0 — Calibration harness (baseline + comparable metrics)

One reusable prompt. It builds a metrics extractor on first run, reuses it after,
archives the old prose reports once, and is the single thing you re-paste after
every fix to regenerate the scoreboard. Script measures, agent judges.

```
You are building and running the standing calibration harness for
motion-decompiler at /home/martin/src/perso/motion-decompiler. Read CLAUDE.md
first. This task MEASURES the tool; it must NOT tune or modify engine/planner
source (extension/capture-animation.js, bin/motion-decompile). If you change any
source file the run is invalid.

GOAL: produce one comparable scoreboard across 4 sites so that, as fixes land,
we can see the live-capture hit rate and the failure-cause histogram move.

ONE-TIME SETUP (idempotent, skip the part that is already done):
1. If ./calibration-reports/*.md exist, move them to
   docs/calibration/archive/2026-06-15-prose-baseline/ and add a one-line README
   noting these are the pre-improvement prose reports, superseded by the
   harness.
2. Ensure a metrics extractor exists at bin/calib-metrics (build it if missing,
   spec below). It is mechanical: it parses a run dir and emits metrics.json. No
   model judgment in the numbers.

THE STANDING SITE SET (do not change without telling the PM):
  - ashleybrookecs   https://ashleybrookecs.com/
  - enerblock        https://enerblock.net/en/
  - flowfest         https://www.flowfest.co.uk/
  - vwlab            https://vwlab.io/pages/report   (kept on purpose: this is
        the cross-origin-iframe regression case; expected to flip from
        wrong-document to flagged-iframe once the iframe fix lands)

PER-SITE PROCEDURE (identical for all 4, real headed browser per CLAUDE.md, use
the repo wrapper bin/capture-browser, a unique AGENT_BROWSER_SESSION per site):
  a. scout -> decompile, full planner-proposed manifest, no curation, soft-fail
     expected (capture failures record status and the run continues).
  b. Run bin/calib-metrics on the run dir to produce <run_dir>/metrics.json in
     the fixed schema.
  c. For failure-cause buckets the script marks "other", read the recorded
     reason and re-bucket if it clearly fits a known cause; leave genuinely
     ambiguous ones as "other".
  d. Write a SHORT fixed-format note per site (docs/calibration/<date>/<site>.md)
     using the PER-SITE NOTE TEMPLATE below. No paragraphs, honor the caps. Then
     drop the heavy artifacts from your working memory before the next site
     (keep only metrics.json).
  e. If a site HARD-fails (pipeline aborts, not a soft capture failure), record
     "hard_fail": true with where it died and CONTINUE to the next site. Never
     abort the whole batch for one site.

AGGREGATION (after all 4):
  - Write docs/calibration/SCOREBOARD.md: one row per site + a totals row, with
    columns: site | stack | proposed | ok | check | empty | error | hit% |
    usable% | animations (measured/verify) | dominant failure cause.
    hit% = ok / attempted; usable% = (ok+check) / attempted; attempted excludes
    skipped. Below the table, a failure-cause histogram summed across all sites,
    using the buckets: occlusion, hidden_not_visible, inert_representative,
    pseudo_element, wrong_trigger_boot_vs_scroll, wrong_document_iframe,
    vendor_animation, other.
  - If a previous SCOREBOARD.md exists, show a diff row (delta on hit% and on
    each failure bucket) so reruns make movement obvious.
  - Stamp the run date (use the shell `date`, do not invent one).

CONSTRAINTS: identical methodology across sites; no source tuning; heavy run
artifacts stay under runs/ (gitignored); only metrics.json, the per-site notes,
and SCOREBOARD.md are kept. Close all browser sessions at the end. Confirm
git status shows no engine/planner/test source changes.

REPORT BACK TO YOUR PM: paste SCOREBOARD.md, the overall hit% and usable%, the
failure-cause histogram, and call out anything that surprised you or any reason
string too vague to bucket (that is itself a finding: it means we need richer
failure reasons, which feeds the Part 5 repair loop).

Commit as: the harness + extractor + archive move as coherent semantic commits;
SCOREBOARD.md and per-site notes as the baseline data commit.

---- bin/calib-metrics spec (dependency-free node or bash) ----
Input: a run directory. Output: <run_dir>/metrics.json with:
  site, url, run_dir, date, stack[], hard_fail,
  captures: { proposed, results, ok, check, empty, error, skipped, attempted,
              hit_rate, usable_rate },
  spec: { animations, measured, verify, timelines_written },
  map: { scroll_triggers, hover_candidates, css_hovers, loops, split_reveals },
  failure_causes: { occlusion, hidden_not_visible, inert_representative,
              pseudo_element, wrong_trigger_boot_vs_scroll,
              wrong_document_iframe, vendor_animation, other },
  wrong_document: null | "<iframe src if the tool flagged one>",
  notable_wins: [], top_failures: [{ id, cause, note }]
Source the numbers from capture-results.json (statuses + reasons),
animations.md / animations.json (counts, measured vs verify, timelines), and
map.json (stack + map counts). Bucket failure_causes by matching the recorded
reason strings to the buckets with a documented keyword map (e.g.
"covered by"/"center is covered" -> occlusion; "no visible elements"/"0x0" ->
hidden_not_visible; "0 moved layers"/"no motion" -> inert_representative or
pseudo_element if an underline/::after is implicated; cross-origin iframe ->
wrong_document_iframe; vendor keyframe names -> vendor_animation); anything
unmatched -> other.

---- PER-SITE NOTE TEMPLATE (docs/calibration/<date>/<site>.md) ----
Fill every field. No paragraphs. Keep to the caps. Use the fixed bucket
vocabulary for causes (occlusion | hidden_not_visible | inert_representative |
pseudo_element | wrong_trigger_boot_vs_scroll | wrong_document_iframe |
vendor_animation | other). If a field is empty, write "none", never omit it.
The cause column uses ONLY those eight buckets. Wins and failures reference
capture ids, not prose, so the same id can be tracked across runs.

# <site> — calibration <date>

URL: <url>
Run: <run_dir>
Stack: <comma list, or "(none detected)">
Hard fail: <yes: where | no>

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   <n>    |<n> | <n>   | <n>   | <n>   |  <n>    | <n%> |  <n%>   |

Spec: <animations> animations (<measured> measured / <verify> verify),
      <timelines> timelines.
Map: ST <n> · hover <n> · cssHover <n> · loop <n> · split <n>.

## Notable wins (max 3, the cleanest measured results)
- <id> — <type> — <one-line what was captured, with the measured number>

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| <id> | <hover/scroll/boot/click/loop> | <empty/error> | <bucket> | <reason> |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- <e.g. wrong_document_iframe: report-vwlab.netlify.app | readiness
  false-positive on loading-container | none>

## Rebuild verdict (one line)
<useful / partial / not useful> — <half-sentence why>
```

---

## Part 1 — The diagnosis layer: honest failure causes (incl. cross-origin iframe)

The Part 0 baseline proved the instrument is blind to three of the buckets we are
about to fix. `wrong_document_iframe` read 0 but is really 5 (all of vwlab).
`wrong_trigger_boot_vs_scroll` read 0 but is at least 1 (flowfest boot).
`pseudo_element` read 0, yet some of the 6 `inert_representative` are really
pseudo-element misses. The tool emits the same vague string for distinct root
causes, so the histogram collapses them and we cannot size any prize before
building it.

So Part 1 is no longer "iframe only." It is the deterministic diagnosis layer:
make every failure self-describe its cause, with iframe detection as its first
and most valuable rule. This is also the deterministic skeleton of the Part 5
repair loop, so building it now shrinks Part 5 to the residual the classifier
cannot resolve. The part is mostly labeling (low risk, no capture-behavior
change) with one behavior action: same-origin iframe re-target and cross-origin
flag. Ship it as three commits in order if it is large: (1) iframe
detect/flag/re-target, (2) the `cause` classifier, (3) the extractor reading
`cause`.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md first. This part makes failures self-describe their cause. With one
exception (same-origin iframe re-target), it does NOT change capture behavior:
pseudo-element sampling and trigger recipes are Parts 2 and 4. Here we only
detect and LABEL, so the scoreboard becomes honest and the prizes are sized.

PROBLEM (evidence: Part 0 baseline SCOREBOARD.md): distinct root causes are
emitted with the same generic failure string, so the failure-cause histogram is
partly fiction. vwlab's 5 errors are a cross-origin iframe but read as
hidden_not_visible. A flowfest boot reveal that should fire on scroll reads as
inert_representative. Underline-on-hover empties read as inert_representative
when they are really pseudo-element.

TASK:
1. Cross-origin / dominant iframe detection (map/scout stage, where map.json is
   built). When a single iframe covers a large fraction of the viewport (sane
   structural threshold, e.g. >= ~60% of viewport area and larger than the top
   doc's own real content):
     - SAME-origin: re-target the map/capture at that iframe's document (or at
       minimum surface it as the recommended target).
     - CROSS-origin (contentDocument inaccessible): do not silently proceed.
       Record a top-level finding in report.md ("primary content is a
       cross-origin iframe: <src>; re-run against that URL") and stop the planner
       promoting zero-size shell chrome as captures.
   Also add a "suspiciously thin document" secondary signal (docHeight ~=
   innerHeight with near-zero real content).
2. A structured failure classifier. At capture-fail time, emit a structured
   `cause` field on each failed capture in capture-results.json, using the fixed
   bucket vocabulary: occlusion, hidden_not_visible, inert_representative,
   pseudo_element, wrong_trigger_boot_vs_scroll, wrong_document_iframe,
   vendor_animation, other. Use cheap live probes on the failed element, at least:
     - dominant cross-origin iframe present -> wrong_document_iframe
     - preflight reports covered/occluded -> occlusion
     - selector 0x0 / not visible (and no iframe) -> hidden_not_visible
     - hover candidate moved 0 element-layers, but the element or its
       ::before/::after has a hover/transition rule on an animatable prop ->
       pseudo_element (suspected; the actual capture fix is Part 2)
     - hover candidate moved 0 layers AND no hover styling found anywhere ->
       inert_representative (genuinely inert)
     - boot reveal returned 0 layers AND ScrollTrigger is present AND the host is
       below the fold at load -> wrong_trigger_boot_vs_scroll (recipe fix is Part 4)
   Keep the reason STRING for humans, but the `cause` field is the machine truth.
3. Update bin/calib-metrics to read the structured `cause` field directly when
   present, falling back to its keyword map for legacy runs.

CONSTRAINTS: framework-agnostic, dependency-free engine. Structural rules only,
no hardcoded hosts or Mammoth literals. Apart from same-origin iframe re-target,
do NOT change what gets captured or how; only detection and labeling. Preserve
measured-vs-verify honesty and soft-fail.

VERIFY: rerun the Part 0 harness on all 4 sites. Expected movement vs baseline:
vwlab's 5 errors leave hidden_not_visible and become wrong_document_iframe, with
report-vwlab.netlify.app surfaced and wrong_document populated; flowfest's
boot-load-reveals is labeled wrong_trigger_boot_vs_scroll; the underline empties
(flowfest underline-link, enerblock link--underline) are labeled pseudo_element.
hit% on the shell will NOT rise (vwlab's real content is cross-origin), so the
win here is correctness and honest attribution, not a hit% jump. Run
tests/run-smoke.sh and node --check.

REPORT BACK TO YOUR PM: the new honest histogram with the diff row vs baseline,
the exact sizes of the pseudo_element and wrong_trigger_boot_vs_scroll buckets
(these size Parts 2 and 4 before we build them), the iframe threshold you chose,
and the vwlab report.md iframe finding (paste it).

Commit semantically (suggested: iframe detect/flag/re-target; then the cause
classifier; then the extractor change).
```

After Part 1 lands, propose to the PM adding https://report-vwlab.netlify.app to
the standing site set, so we measure the real report's motion, not just the
flagged shell.

---

## Part 2 — Pseudo-element sampling (character-changer B)

PM note: Part 1 sized the prize at exactly `pseudo_element` = 2 on the live set
(flowfest div.underline-link, enerblock a.link--underline). Small on these
sites, but underline-on-hover is ubiquitous web-wide, so the fix is justified
regardless of the small-sample count. Those two captures should flip from empty
to ok; that is the headline number to report.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md and the header of extension/capture-animation.js first.

Problem (evidence: flowfest link-hover, enerblock link--underline, ashley
link-hover/misc-hover empties): underline-on-hover and similar effects are
implemented on ::after / ::before pseudo-elements (scaleX, background-size,
width). The engine samples computed style on the element ONLY
(capture-animation.js:478, PROPS at lines 34-35) and never reads
getComputedStyle(el, '::after'). So a whole class of extremely common hover
interactions comes back "empty" even though the motion is real. This is the
single most common cause of false-empty hover captures across the calibration
set.

Task: extend the per-frame sampler to also sample ::before and ::after pseudo-
elements for the relevant properties (transform, opacity, width, the
background-size / background-position used for underline grows, and clipPath).
Emit pseudo-element motion as its own track/layer, clearly labeled (e.g.
"<selector>::after"), so the spec distinguishes element motion from pseudo
motion. Keep the measured/verify confidence labeling consistent with element
tracks.

Constraints: dependency-free, framework-agnostic, single source of truth (the
extension and snippet both load this file). Watch performance: pseudo sampling
multiplies getComputedStyle calls per tracked node per frame; only sample pseudos
for tracked elements, not the whole tree. Do not regress existing element-level
capture.

Verify: re-run a headed capture (repo wrapper, per CLAUDE.md) on flowfest's nav
"About" underline (div.underline-link) and/or enerblock's link--underline. The
previously-empty capture should now record a non-empty pseudo-element track
(e.g. ::after scaleX 0->1 or background-size growth). Run tests/run-smoke.sh and
node --check.

Report back to your PM: which sites/selectors you verified, the before/after
(empty -> captured), the pseudo track shape you got, any perf impact on frame
sampling, and the Part 0 metric delta.

Commit semantically.
```

---

## Part 2.5 — Degenerate transform decode (suppress spurious rotation when scale ~ 0)

Promoted from the Part 2 follow-up. Not cosmetic: it corrupts the spec for the
scale-from-zero reveals Part 2 just unlocked (underlines, pop-ins), so a rebuild
agent would add a rotation that is not there. Small, contained engine fix.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md first. Single-file engine change: extension/capture-animation.js,
function decodeTransform.

PROBLEM: a scaleX(0) rest matrix (matrix(0,0,0,1,0,0)) decodes to a spurious
rotation alongside the correct scaleX. In the 2D branch, rotate = atan2(b, a):
when scaleX = hypot(a,b) ~ 0, the (a,b) column is rank-deficient and the angle is
indeterminate, so floating-point residuals in the browser's computed matrix get
amplified into a bogus angle (observed ~90deg on flowfest's underline). The 3D
branch has the same degeneracy: R divides by sx/sy/sz, and the `|| 1` fallback
when an axis scale ~ 0 yields a garbage rotation. Part 2 made scaleX/scaleY-from-
zero a common captured case (underline reveals), so this now fires often and
misleads recreation.

TASK: when a decomposed scale axis magnitude is below a small epsilon, the
rotation about the collapsed axis is unrecoverable; do NOT attribute a rotation
there. In the 2D branch, if scaleX (or scaleY) < eps, report rotate 0 instead of
the atan2 result. Guard the 3D branch equivalently (suppress rotation components
that depend on a near-zero axis scale). Leave the non-degenerate path
byte-for-byte unchanged; this is a guarded special-case only. Pick eps
conservatively (e.g. ~1e-3 on the decomposed scale) so a genuine
small-scale-with-real-rotation is not swallowed; a truly collapsed axis is the
only thing being guarded.

CONSTRAINTS: dependency-free, framework-agnostic, single source of truth. No
behavior change to capture or timing; only the matrix decode.

VERIFY:
- Add a small assertion (smoke or inline) that
  decodeTransform('matrix(0,0,0,1,0,0)') yields scaleX ~ 0, scaleY ~ 1, rotate 0
  (no spurious angle), AND that a genuine rotation (e.g. matrix(0,1,-1,0,0,0) =
  90deg at unit scale) STILL decodes to rotate 90 — the guard only fires on
  collapsed scale.
- Re-capture flowfest div.underline-link (headed, repo wrapper per CLAUDE.md):
  the ::before track should now read scaleX 0->1 with NO rotate component.
- Run tests/run-smoke.sh and node --check.

REPORT BACK TO YOUR PM: the before/after on the flowfest underline track (the
rotate row gone), the epsilon you chose, and confirmation a real rotation still
decodes correctly. No Part 0 metric change is expected (hit% unaffected); this is
a spec-correctness fix, verified by inspection.

Commit semantically.
```

---

## Part 3 — Ranking + presentation sweep (low-risk, no browser)

PM note: (a) vendor de-rank and (b) drawSVG grouping do NOT show up in the
failure histogram (they are spec-quality, not failures). Verify them by
inspection: Shop Pay is no longer the #1 signature, drawSVG rows are grouped.
Only the label-bug fix (c) feeds the Part 0 buckets.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md first. These are independent low-risk fixes; do them as separate
semantic commits.

Three issues, all from the calibration set:

(a) Vendor/third-party animations ranked as signatures (vwlab): the #1
    "signature" was Shopify's acceleratedCheckoutLoadingSkeleton (Shop Pay
    shimmer). Injected third-party motion (Shop Pay, Intercom, cookie banners,
    chat widgets) should be de-ranked or filtered out of the signature tier, not
    promoted. Add a maintainable denylist of known vendor @keyframes names /
    injected-animation sources and de-rank matches. Keep the animation in the
    spec but out of the "signature" top tier, and label why.

(b) drawSVG path spam (flowfest): one ScrollTrigger emits ~20+ near-identical
    "Path scroll motion" rows (0.75s Power1.easeOut). Group path entries by their
    owning ScrollTrigger into a single entry with a count, instead of one row per
    path.

(c) "scroll target" mislabel (vwlab, bin/motion-decompile:816): hover/click
    preflight failures are reported as "Preflight failed for scroll target ..."
    because the label is hardcoded. Pass the real action label (hover/click/
    scroll) so failure reasons are accurate. This also improves the Part 0
    failure-cause bucketing.

Constraints: no behavior change to actual capture; these are ranking/labeling/
grouping only. Dependency-free.

Verify: re-derive the spec for vwlab and flowfest from their existing run dirs if
possible (no new browser run needed); confirm Shop Pay is no longer a signature,
drawSVG rows are grouped, and a hover preflight error now says "hover" not
"scroll target." Run tests/run-smoke.sh.

Report back to your PM: the vendor denylist you started, before/after on the
flowfest drawSVG grouping, confirmation the label bug is fixed, and rerun the
Part 0 metric if convenient so we see any bucketing improvement.
```

---

## Part 4 — Planner reveal/trigger recipes (needs browser)

PM note: Part 1 sized fix (a) at `wrong_trigger_boot_vs_scroll` = 1 (flowfest
boot-load-reveals). Fix (c) additionally recovers the accordion (flowfest
accordion-click, an `occlusion` failure from clicking the body not the header),
and fix (b) improves the ashley boot-reveal signal. Expect ~2 captures to flip
to ok plus one quality fix.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md first, especially the "timed-capture recipe" section.

Three planner heuristic fixes from the calibration set:

(a) Split reveals routed to boot but fire on scroll (flowfest boot empty; ashley
    boot latched onto text reflow). When ScrollTrigger is present in the detected
    stack, split-reveal hosts should be captured with a scroll-into-view recipe
    (settle -> arm -> realScroll the host into view -> wait -> dump), NOT a
    boot/load recipe. Keep boot for genuine load reveals.

(b) Boot reveal latches onto layout reflow (ashley): the boot capture described
    width/height deltas of split-text fragments (145.5->134.7px) rather than the
    headline's reveal transform. Prefer transform/opacity as the reveal signal
    and treat pure width/height reflow of text fragments as noise (or at least
    flag it), so reveal captures report the intended motion.

(c) Accordion/toggle clicks the wrong element (flowfest accordion-click error;
    also the residual generic flaw in memory): the planner set the action to
    click the collapsible body (item-bottom-content), which sits behind the
    header, so preflight refused it. The click target should be the visible
    toggle affordance (header/icon), not the collapsible content.

Constraints: structural heuristics only, no per-site hardcoding. Do not
reintroduce Mammoth-specific literals. Preserve soft-fail behavior.

Verify (headed, repo wrapper per CLAUDE.md): flowfest split reveals
(speakers__grid-lines / community__grid-lines) should now capture on scroll
instead of coming back empty at boot; flowfest accordion-click should now hit the
header and capture instead of erroring on occlusion; the ashleybrookecs boot
reveal should report transform/opacity rather than text width/height. Run
tests/run-smoke.sh and node --check.

Report back to your PM: before/after on those three captures, and the Part 0
metric delta vs baseline.
```

---

## Part 5 — Capture-repair loop: DESIGN ONLY (the intelligence layer)

This is the one checkpoint where the PM reviews a design before a clean context
builds it. Part 6 (the build) is written after this design lands.

PM note: Part 1 already ships the deterministic diagnosis layer (the structured
`cause` classifier), so this loop is now smaller. The LLM only handles the
residual the classifier marks ambiguous or that needs an open-ended repair
(sibling element, tighter selector, re-target). Do not re-derive diagnosis the
classifier already does.

```
Work on motion-decompiler at /home/martin/src/perso/motion-decompiler. Read
CLAUDE.md and the driver-model section. This task produces a DESIGN, not an
implementation. Do not change capture behavior yet.

Context: after the deterministic fixes (Parts 1-4), a residual set of captures
will still come back empty/error for reasons no fixed rule can fully resolve
(inert representative selector, occlusion that needs a sibling, ambiguous
trigger, re-target decisions). Today soft-fail records the reason and gives up.
We want an agentic diagnose-and-retry loop: on empty/error, an LLM gets the
failure reason + a screenshot + the relevant map subtree, diagnoses the cause,
proposes a corrected recipe (tighter selector, different trigger,
scroll-into-view, sibling element, iframe re-target), and we retry once or twice.

Hard principle to preserve: the LLM decides WHAT and HOW to capture and how to
REPAIR a failure. It must NEVER measure motion (durations, easings, from/to). The
engine's per-frame sampling and its measured-vs-verify honesty stay the source of
truth. Do not let the design route measurement through the model.

Produce a short design doc (docs/ or plans/) covering:
- Where the loop hooks into bin/motion-decompile (the capture stage, after a
  capture returns empty/error).
- The diagnosis input contract (failure reason, screenshot, map subtree, the
  recipe that failed) and the structured output contract (diagnosis bucket +
  proposed corrected recipe + confidence). Reuse the Part 0 failure-cause
  buckets.
- Retry policy (max retries, when to give up, how to avoid infinite loops and
  cost blowups).
- How a repaired capture is recorded so the scoreboard can distinguish
  "ok-first-try" from "ok-after-repair" (we want to measure how much the loop
  actually buys).
- Driver-agnosticism: it must work across the agent-browser / claude-in-chrome /
  minimal driver model, not assume one.

Report back to your PM: the design doc, the input/output contracts, and your
honest estimate of which failure buckets the loop can realistically fix vs which
still need a human. The PM will review and greenlight the build as a separate
task (Part 6).
```

---

## Part 6 — Capture-repair loop: BUILD

To be written once the Part 5 design lands, because how it is built depends on
the contracts that design settles on.

---

## How to run the loop

1. Run Part 0 once. Commit the baseline `SCOREBOARD.md`.
2. Pick a part (1 and 2 are the highest leverage). Drop its prompt into a clean
   context. The agent reports back, including the Part 0 metric delta.
3. PM (this thread) reviews the report, adjusts the next prompt if needed.
4. Repeat. The scoreboard is the single source of truth for whether the tool is
   getting better.
