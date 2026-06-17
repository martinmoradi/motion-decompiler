# Calibration: vwlab.io/pages/report

Full scout + yoink pass on a non-Mammoth site, to test whether
YoinkIt generalizes beyond mammothmurals.com. No source files were
tuned for this site.

- **Date:** 2026-06-15
- **Target:** https://vwlab.io/pages/report
- **Session:** `AGENT_BROWSER_SESSION=motion-claude-vwlab`
- **Driver:** repo wrapper `bin/capture-browser` (headed agent-browser), not raw.

## Result summary

| Field | Value |
| -- | -- |
| Run directory | `runs/vwlab.io/2026-06-15-claude-vwlab` |
| Smoke result | `ok: true`, 21/21 checks pass, exit 0 |
| `node --check` engine + CLI | both OK |
| Stack detected | none (`libs: []`, "(none detected)") |
| Proposed captures | 5 |
| Capture results | 5 |
| Timelines written | 0 |
| Animations in spec | 2 (measured: 1, unknown/verify: 1) |
| Pipeline hard-fail | no - completed end to end |

### Capture status counts

| Status | Count | Captures |
| -- | -- | -- |
| ok | 0 | - |
| check | 0 | - |
| empty | 0 | - |
| error | 5 | css-hover-a-link-list-social-link, primary-button-hover, nav-link-hover, link-hover, misc-hover |
| skipped | 0 | - |

All 5 captures were recorded as `status:"error"` with a human-readable reason
and the run continued to completion (assembler + report still produced). This is
exactly the soft-fail behavior the calibration was meant to exercise, and it held
even when **every** capture failed. The whole run never hard-failed.

## The headline finding: the tool yoinked the wrong document

`vwlab.io/pages/report` is **not the report**. It is a thin Shopify "embed
shell" page (`body.page.embed.is-popup`, title "Report | VWLAB") whose only real
content is a **cross-origin iframe**:

```
iframe.embed-page  ->  https://report-vwlab.netlify.app   (1280x800, contentDocument NOT accessible)
```

The actual animated report lives on the Netlify app, inside a cross-origin
iframe the engine cannot inject into or read. The top document the engine *did*
map and capture contains nothing but Shopify store chrome: a header, a mini-cart
popup (open by default - body has `is-popup`, text "YOUR BAG IS EMPTY"), a
full-viewport `screen-fader`, newsletter form, social links, and a Shop Pay
wallet-button skeleton. Live check of the top document:

- `document.body.scrollHeight` = 802, `innerHeight` = 800 - the entire "page" is
  one collapsed viewport.
- All 5 planned hover roots exist (`querySelectorAll` count 1-6) but render at
  **0x0 at (0,0)** with `display` set / `visibility:visible` / `opacity:1`.

So the captures didn't fail because of bad selectors or a strict preflight; they
failed because the engine was pointed at a shell whose chrome is zero-size and
whose real content is sandboxed in another origin.

## Top signature animations (from animations.md)

The prompt asks for the top 8. **Only 2 exist**, and both are static-CSS
artifacts of the Shopify shell, not motion of the report:

1. **Wallet cart button skeleton CSS loop**
   (`css-loop-0-...-wallet-cart-button-skeleton`) - load, CSS keyframes
   `acceleratedCheckoutLoadingSkeleton`, 1 layer, 4s infinite, ease, confidence
   **measured**. This is Shopify's injected Shop Pay / accelerated-checkout
   skeleton shimmer - third-party chrome, not site design.
2. **CSS hover opacity 0.25s ease-out** (`p-css-hover-opacity-0-25s-ease-out`,
   host `a.link.list-social__link`) - hover, opacity over 0.25s ease-out,
   confidence **unknown - verify** (derived from static CSS transition data, no
   live deltas).

There is no #3-#8. The spec is essentially empty of real report motion.

## Where the (thin) spec came from

Zero of 5 live captures produced a timeline (`Timelines: 0`). Both spec entries
come from the **map's static analysis** of the top document: one `@keyframes`
loop and one CSS hover transition group. Unlike the flowfest run - where the map
salvaged ~46 measured animations from a GSAP ScrollTrigger registry - here there
is no library (`libs: []`, no GSAP/ScrollTrigger registry to read), so the map
had almost nothing to fall back on. The only motion in reach was vendor chrome.

## Failed and empty captures, with likely reasons

### Errors (preflight refused before any timeline) - 5

All 5 errored identically: *"Preflight failed for scroll target `<sel>`:
selector matched no visible elements."*

- **css-hover-a-link-list-social-link** (`a.link.list-social__link`) - 6 matches,
  all 0x0.
- **primary-button-hover** (`a.header__cta.e-flex`) - 1 match, 0x0.
- **nav-link-hover** (`li.header__nav__link`) - 3 matches, all 0x0.
- **link-hover** (`a.header__link.lined`) - 3 matches, all 0x0.
- **misc-hover** (`a.header__logo.w-inline-block`) - 1 match, 0x0.

Single root cause: these are Shopify-shell chrome elements that are present but
collapsed to zero size in the embed page; the real, sized versions live inside
the cross-origin iframe. Preflight's `width>1 && height>1` rule correctly
rejected them. Good outcome - precise reasons, run continued - but the *reason
the elements are dead* is the iframe architecture, which the tool never surfaces.

## Did the output feel useful for recreating the site's motion?

**No.** A coding agent handed this spec would rebuild a Shopify wallet-button
shimmer and a social-link fade - neither of which is the vwlab report. The actual
report (scroll-driven data-viz / motion on `report-vwlab.netlify.app`) is
entirely absent. The artifact is honest about its own thinness (1 measured, 1
"unknown - verify", a "Can't spec-capture: remaining-hover-candidates" note), so
it does not *hallucinate* motion - but it also gives no hint that it captured the
wrong document. The single most useful output would have been a flag: "primary
content is a cross-origin iframe (report-vwlab.netlify.app); point the tool
there."

**Actionable next step:** re-run YoinkIt directly against
`https://report-vwlab.netlify.app` (same-origin to itself, real content), which
is where this site's character actually lives.

## Generic product issues vs site-specific weirdness

**Generic product issues (would recur on other sites):**

- **No cross-origin iframe detection.** The engine maps and captures only the top
  document. On any embed-shell architecture (Shopify/Webflow page iframing a
  separate app, Framer/Notion embeds, etc.) it will silently yoink the
  wrapper and report the wrong thing. At minimum the map should detect a dominant
  iframe (here: a 1280x800 `iframe.embed-page` that is ~100% of the viewport) and
  either re-target it (if same-origin) or report it as the real content surface
  (if cross-origin). This is the biggest gap this run exposed.
- **Vendor/third-party keyframes ranked as "signature moments."** The #1
  signature was Shopify's `acceleratedCheckoutLoadingSkeleton`. Injected
  third-party animations (Shop Pay, chat widgets, cookie banners) should be
  filtered or de-ranked, not promoted to the top of the spec.
- **"scroll target" mislabel on hover captures.** The preflight error reads
  "Preflight failed for *scroll target* `<sel>`" for hover captures. The CLI
  scrolls a hover root into view and preflights it with a hardcoded label
  `'scroll target'` (`bin/yoinkit:816`), so every hover/click failure is
  mislabeled as a scroll failure. Cosmetic but misleading in reports.
- **Readiness probe says "no blockers" on an empty shell.** page-state reported
  2 readiness samples and "No loader, challenge, or rate-limit blockers" while the
  document was a one-viewport shell (`docH ~= winH`) with zero real content. A
  "content is suspiciously thin / dominated by an iframe" heuristic would catch
  this class of page.

**Site-specific weirdness (vwlab-only):**

- Shopify page that embeds the real report from a separate Netlify origin in a
  cross-origin iframe (`report-vwlab.netlify.app`).
- Mini-cart popup open by default (`body.is-popup`, "YOUR BAG IS EMPTY") with a
  `screen-fader` overlay (here harmless: `opacity:0`, `pointer-events:none`).
- Webflow-exported class names (`.e-flex`, `.w-inline-block`) on a Shopify store.

## Signs the planner is overfit to Mammoth?

**No literal overfit on this site.** No `g_faq_item` / accordion-root hardcode
fired (this page has no accordion). Every proposed selector is a genuine vwlab
class derived from the map (`header__cta`, `header__nav__link`, `header__logo`,
`list-social__link`), and the planner deduped 18 mapped hover candidates down to
5 representatives generically. The planner logic itself generalized fine; the
failure was entirely upstream in **document targeting** (mapping the top frame
instead of the iframe), which is not Mammoth-specific.

If anything, this run is *clean* evidence against overfit: a no-library Shopify
shell produced a coherent, generic, honestly-thin spec with no Mammoth residue.

## Source files modified

**None.** `git status --short` after the run is identical to the session-start
snapshot:

```
 M README.md           (pre-existing, not mine)
 M bin/yoinkit (pre-existing, not mine)
 M tests/run-smoke.sh   (pre-existing, not mine)
?? calibration-reports/ (this report)
?? prompt.md            (pre-existing)
```

The three `M` files were already modified before this run began (per the
session-start git snapshot) and I did not touch them. `runs/` is gitignored, so
the run artifacts do not appear. No engine, CLI, or test source was edited for
this calibration. Browser session was closed (no active sessions remain).
