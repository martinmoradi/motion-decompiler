#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="motion-smoke-$$"
SERVER_LOG="$(mktemp)"
TMP_ASSEMBLE=""
export AGENT_BROWSER_CONFIRM_ACTIONS="${AGENT_BROWSER_CONFIRM_ACTIONS:-}"
export AGENT_BROWSER_CONFIRM_INTERACTIVE="${AGENT_BROWSER_CONFIRM_INTERACTIVE:-false}"
AB=(agent-browser --confirm-actions "" --confirm-interactive false)
PORT="$(
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
URL="http://127.0.0.1:${PORT}/tests/fixtures/basic-motion.html"

node --check "$ROOT/bin/motion-decompile" >/dev/null
"$ROOT/bin/motion-decompile" --help | grep -q 'scout <url>'
"$ROOT/bin/motion-decompile" --help | grep -q 'decompile <run-dir>'

cleanup() {
  "${AB[@]}" --session "$SESSION" close --all >/dev/null 2>&1 || true
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${XSERVER_PID:-}" ]]; then
    kill "$XSERVER_PID" >/dev/null 2>&1 || true
    wait "$XSERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$ROOT/tests/fixtures/_xorigin-shell.html"
  if [[ -n "$TMP_ASSEMBLE" ]]; then
    rm -rf "$TMP_ASSEMBLE"
  fi
  rm -f "$SERVER_LOG"
}
trap cleanup EXIT

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
sleep 0.4

"${AB[@]}" --session "$SESSION" --init-script "$ROOT/extension/capture-animation.js" open "$URL" >/dev/null

SMOKE_JS='
(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const checks = {};
  const samples = {};

  function check(name, condition, detail = "") {
    checks[name] = Boolean(condition);
    if (!condition) throw new Error(detail ? `${name}: ${detail}` : name);
  }

  async function captureOn(selector, mutate, waitMs = 650) {
    window.__cap.on(selector, { trigger: "manual" });
    await frame();
    mutate();
    await sleep(waitMs);
    return window.__cap.dump({ copy: false });
  }

  try {
    document.querySelector("#multi").classList.remove("active");
    await sleep(80);
    const multi = await captureOn("#multi", () => {
      document.querySelector("#multi").classList.add("active");
    });
    const multiFinding = multi.findings[0];
    const multiProps = Object.keys(multiFinding.properties || {});
    samples.multiProps = multiProps;
    check("multi transform preserved", multiProps.includes("transform"));
    check("multi opacity preserved", multiProps.includes("opacity"));
    check("multi filter preserved", multiProps.includes("filter"));

    document.querySelector("#stagger").classList.remove("active");
    await sleep(120);
    const stagger = await captureOn("#stagger", () => {
      document.querySelector("#stagger").classList.add("active");
    }, 900);
    samples.staggerFindings = stagger.findings.length;
    samples.staggerSummary = stagger.stagger;
    check("stagger keeps sibling findings", stagger.findings.length === 4, `${stagger.findings.length}`);
    check("stagger has summary metadata", stagger.stagger && stagger.stagger.items === 4);
    check("stagger has no synthetic note finding", !stagger.findings.some(f => f.note));

    document.querySelectorAll(".duplicate").forEach(el => el.classList.remove("active"));
    await sleep(80);
    const duplicate = await captureOn(".duplicate", () => {
      document.querySelectorAll(".duplicate").forEach(el => el.classList.add("active"));
    }, 550);
    const duplicateFinding = duplicate.findings[0];
    samples.duplicateLocator = duplicateFinding.locator;
    check("duplicate rendered match selected", duplicateFinding.locator.visibleMatchCount === 1);
    check("duplicate ambiguity counted", duplicateFinding.locator.matchCount === 2);
    check("duplicate unique selector exists", Boolean(duplicateFinding.locator.uniqueSelector));

    document.querySelector("#accordion").classList.remove("open");
    await sleep(80);
    const accordion = await captureOn("#accordion-panel", () => {
      document.querySelector("#accordion").classList.add("open");
    }, 650);
    samples.accordionProps = accordion.findings.map(f => Object.keys(f.properties || {}));
    check("accordion height captured", accordion.findings.some(f => f.properties && f.properties.height));

    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    window.getComputedStyle = (el, ...args) => {
      const cs = nativeGetComputedStyle(el, ...args);
      if (el && el.id === "spike-panel") {
        return new Proxy(cs, {
          get(target, prop) {
            if (prop === "height") return el.classList.contains("open") ? "64000px" : "0px";
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
          }
        });
      }
      return cs;
    };
    document.querySelector("#spike-panel").classList.remove("open");
    await sleep(80);
    const spike = await captureOn("#spike-panel", () => {
      document.querySelector("#spike-panel").classList.add("open");
    }, 650);
    window.getComputedStyle = nativeGetComputedStyle;
    const spikeHeight = spike.findings[0] && spike.findings[0].properties && spike.findings[0].properties.height;
    samples.spikeHeight = spikeHeight && { from: spikeHeight.from, to: spikeHeight.to };
    check("layout spike normalized", spikeHeight && spikeHeight.to !== "64000px" && parseFloat(spikeHeight.to) < 100);

    document.querySelector("#nested-spike-shell").classList.remove("open");
    await sleep(80);
    window.__cap.scan("#nested-spike-shell", { trigger: "manual" });
    await frame();
    document.querySelector("#nested-spike-shell").classList.add("open");
    await sleep(650);
    const nestedSpike = window.__cap.dump({ copy: false });
    const nestedHeights = nestedSpike.findings
      .map(f => f.properties && f.properties.height)
      .filter(Boolean)
      .map(h => ({ from: h.from, to: h.to }));
    samples.nestedSpikeHeights = nestedHeights;
    check("nested layout spike normalized", nestedHeights.length >= 2 &&
      nestedHeights.every(h => parseFloat(h.to) < 100), JSON.stringify(nestedHeights));

    const sprite = await captureOn("#sprite", () => {}, 750);
    const spriteFinding = sprite.findings[0];
    samples.spriteType = spriteFinding && spriteFinding.type;
    check("sprite loop detected", Boolean(spriteFinding && (
      spriteFinding.type === "css-sprite" ||
      (spriteFinding.properties && spriteFinding.properties.backgroundPosition &&
       spriteFinding.properties.backgroundPosition.type === "css-sprite")
    )));

    const gsapBox = document.querySelector("#gsap-box");
    gsapBox.removeAttribute("style");
    await sleep(80);
    const gsapCapture = await captureOn("#gsap-box", () => {
      window.CustomEase.create("fixture-ease", "M0,100 C25,75 75,25 100,0");
      window.gsap.to("#gsap-box", {
        x: 38,
        scale: 1.2,
        opacity: 0.85,
        duration: 0.2,
        ease: "fixture-ease",
        stagger: 0.05
      });
    }, 350);
    const gsapEvidence = gsapCapture.evidence && gsapCapture.evidence.gsap;
    const gsapEntry = gsapEvidence && gsapEvidence.entries.find(e => e.method === "to" && e.vars && e.vars.ease === "fixture-ease");
    samples.gsapEvidence = gsapEvidence && {
      installed: gsapEvidence.installed,
      entryCount: gsapEvidence.entries.length,
      customEases: gsapEvidence.customEases.map(e => e.id)
    };
    check("gsap probe installed", gsapEvidence && gsapEvidence.installed);
    check("gsap tween logged", Boolean(gsapEntry));
    check("gsap tween targets captured", gsapEntry && gsapEntry.targetCount === 1);
    check("gsap custom ease captured", gsapEvidence.customEases.some(e => e.id === "fixture-ease" && e.svgData));
    check("finding links gsap evidence", gsapCapture.findings.some(f => f.gsap && f.gsap.relatedEntryIds.includes(gsapEntry.id)));

    gsapBox.removeAttribute("style");
    await sleep(80);
    window.__cap.boot({ selectors: ["#gsap-box"], ms: 280 });
    await frame();
    window.gsap.to("#gsap-box", { x: 52, opacity: 0.6, duration: 0.18, ease: "power2.out" });
    await sleep(340);
    const boot = window.__cap.bootDump({ copy: false });
    samples.boot = {
      mode: boot.meta.mode,
      findings: boot.findings.length,
      gsapEntries: boot.evidence.gsap.entries.length,
    };
    check("boot recorder reports boot mode", boot.meta.mode === "boot");
    check("boot recorder captures motion", boot.findings.length >= 1);
    check("boot recorder includes gsap evidence", boot.evidence.gsap.entries.some(e => e.method === "to" && e.vars.ease === "power2.out"));

    return { ok: true, checks, samples };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      checks,
      samples,
      lastSummary: window.__capLast && window.__capLast.summary
    };
  }
})()
'

RESULT="$("${AB[@]}" --session "$SESSION" eval "$SMOKE_JS")"
printf '%s\n' "$RESULT" | jq -e '.ok == true and ([.checks[]] | all(. == true))' >/dev/null
printf '%s\n' "$RESULT" | jq '{ok, checks, samples}'

# --- dominant same-origin iframe + thin-document detection (engine map()) ----
IFRAME_URL="http://127.0.0.1:${PORT}/tests/fixtures/iframe-shell.html"
"${AB[@]}" --session "$SESSION" --init-script "$ROOT/extension/capture-animation.js" open "$IFRAME_URL" >/dev/null
"${AB[@]}" --session "$SESSION" wait 600 >/dev/null
IFRAME_MAP="$("${AB[@]}" --session "$SESSION" eval '(() => window.__cap.map())()')"
printf '%s\n' "$IFRAME_MAP" | jq -e '
  (.dominantIframe != null) and
  (.dominantIframe.sameOrigin == true) and
  (.dominantIframe.accessible == true) and
  (.dominantIframe.areaRatio > 0.6) and
  (.dominantIframe.src | test("basic-motion")) and
  (.recommendedTarget | test("basic-motion")) and
  (.thinDocument.thin == true)
' >/dev/null
printf '%s\n' "$IFRAME_MAP" | jq '{dominantIframe, recommendedTarget, thinDocument}'

# --- dominant CROSS-origin iframe detection. A second server on a different
# --- port is a different origin, so the shell can't read the frame's document. -
XPORT="$(
  python3 - <<'PY'
import socket
s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()
PY
)"
python3 -m http.server "$XPORT" --bind 127.0.0.1 --directory "$ROOT" >>"$SERVER_LOG" 2>&1 &
XSERVER_PID=$!
sleep 0.4
XSHELL="$ROOT/tests/fixtures/_xorigin-shell.html"
cat >"$XSHELL" <<HTML
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100vw;height:100vh;border:0}</style></head>
<body><header>shell</header><iframe src="http://127.0.0.1:${PORT}/tests/fixtures/basic-motion.html"></iframe></body></html>
HTML
"${AB[@]}" --session "$SESSION" --init-script "$ROOT/extension/capture-animation.js" open "http://127.0.0.1:${XPORT}/tests/fixtures/_xorigin-shell.html" >/dev/null
"${AB[@]}" --session "$SESSION" wait 700 >/dev/null
XMAP="$("${AB[@]}" --session "$SESSION" eval '(() => window.__cap.map())()')"
kill "$XSERVER_PID" >/dev/null 2>&1 || true
rm -f "$XSHELL"
printf '%s\n' "$XMAP" | jq -e '
  (.dominantIframe != null) and
  (.dominantIframe.sameOrigin == false) and
  (.dominantIframe.accessible == false) and
  (.dominantIframe.areaRatio > 0.6) and
  (.dominantIframe.src | test("basic-motion")) and
  (.recommendedTarget | test("basic-motion"))
' >/dev/null
printf '%s\n' "$XMAP" | jq '{dominantIframe}'

TMP_ASSEMBLE="$(mktemp -d)"
mkdir -p "$TMP_ASSEMBLE/timelines"
cat >"$TMP_ASSEMBLE/manifest.json" <<'JSON'
{
  "url": "http://example.test/",
  "viewport": [800, 600],
  "captures": [
    {
      "id": "fixture-click",
      "type": "click",
      "root": "#accordion",
      "label": "Fixture accordion"
    },
    {
      "id": "empty-scroll",
      "type": "scroll-reveal",
      "root": "#missing-motion",
      "label": "Empty scroll"
    },
    {
      "id": "failed-hover",
      "type": "hover",
      "root": "#covered",
      "label": "Failed hover"
    }
  ]
}
JSON
cat >"$TMP_ASSEMBLE/map.json" <<'JSON'
{
  "libs": ["GSAP"],
  "scrollTriggers": [
    {
      "i": 1,
      "trigger": "#hero",
      "start": "top bottom",
      "end": "bottom top",
      "scrub": true,
      "pin": false,
      "toggleActions": "play",
      "callbacks": [],
      "anims": [
        {
          "targets": ["#hero-image"],
          "targetCount": 1,
          "duration": 0.5,
          "ease": "none",
          "stagger": null,
          "props": { "y": 125 }
        }
      ]
    },
    {
      "i": 2,
      "trigger": "#cta",
      "start": "top bottom",
      "end": "bottom top",
      "scrub": false,
      "pin": false,
      "toggleActions": "play",
      "callbacks": ["onEnter"],
      "anims": []
    }
  ],
  "cssHovers": [
    {
      "sel": ".button",
      "prop": "transform",
      "dur": "0.45s",
      "ease": "cubic-bezier(0.2, 0.8, 0.2, 1)"
    },
    {
      "sel": "a",
      "prop": "opacity",
      "dur": "0.2s",
      "ease": "ease"
    },
    {
      "sel": "div.accordion-css__item-panel",
      "prop": "height",
      "dur": "0.3s",
      "ease": "ease"
    }
  ],
  "loops": [
    {
      "sel": "#sprite",
      "name": "spriteFrames",
      "dur": "0.5s",
      "timing": "steps(4)"
    }
  ],
  "splitReveals": [
    {
      "host": "h1.hero",
      "section": "section.hero",
      "count": 2,
      "kinds": ["lines-split"]
    }
  ],
  "hoverCandidates": ["a", "a.button", ".button__label", "div.accordion-css__item", "button.accordion-css__item-trigger"]
}
JSON
cat >"$TMP_ASSEMBLE/page-state.json" <<'JSON'
{
  "updatedAt": "2026-06-15T00:00:00.000Z",
  "records": [
    {
      "phase": "map",
      "outcome": "ready",
      "waitedMs": 700,
      "state": { "readyState": "complete", "textLength": 120, "elementCount": 20, "blockers": [] }
    },
    {
      "phase": "capture:fixture-click:open",
      "outcome": "timeout-loading",
      "waitedMs": 8000,
      "state": { "readyState": "complete", "textLength": 12, "elementCount": 4, "blockers": [{ "type": "loading", "evidence": "Loading..." }] }
    }
  ]
}
JSON
cat >"$TMP_ASSEMBLE/capture-results.json" <<'JSON'
{
  "capturedAt": "2026-06-15T00:00:00.000Z",
  "count": 3,
  "results": [
    {
      "id": "fixture-click",
      "type": "click",
      "timelineRef": "timelines/fixture-click.json",
      "summary": "Fixture accordion opens.",
      "findings": 1
    },
    {
      "id": "empty-scroll",
      "type": "scroll-reveal",
      "timelineRef": "timelines/empty-scroll.json",
      "summary": "no animation captured",
      "findings": 0
    },
    {
      "id": "failed-hover",
      "type": "hover",
      "status": "error",
      "timelineRef": null,
      "summary": "capture failed before a timeline could be saved",
      "findings": 0,
      "stop": "error",
      "error": "element is covered by another element"
    }
  ]
}
JSON
cat >"$TMP_ASSEMBLE/timelines/fixture-click.json" <<'JSON'
{
  "meta": {
    "source": "http://example.test/",
    "libraries": ["GSAP"],
    "mode": "scan",
    "trigger": "manual",
    "terminationReason": "settled",
    "rootSelector": "#accordion",
    "durationMs": 700,
    "elementsMoved": 1
  },
  "summary": "Fixture accordion opens.",
  "stagger": null,
  "findings": [
    {
      "selector": "#panel",
      "type": "height",
      "leadProperty": "height",
      "properties": {
        "height": {
          "from": "0px",
          "to": "64px",
          "timing": {
            "duration": "0.25s",
            "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
          }
        }
      },
      "timing": {
        "duration": "0.25s",
        "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)"
      }
    }
  ]
}
JSON
cat >"$TMP_ASSEMBLE/timelines/empty-scroll.json" <<'JSON'
{
  "meta": {
    "source": "http://example.test/",
    "libraries": ["GSAP"],
    "mode": "scan",
    "trigger": "scroll",
    "terminationReason": "manualDump",
    "rootSelector": "#missing-motion",
    "durationMs": 800,
    "elementsMoved": 0
  },
  "summary": "no animation captured",
  "stagger": null,
  "findings": []
}
JSON
"$ROOT/bin/motion-decompile" plan "$TMP_ASSEMBLE" >/dev/null
jq -e '
  .url == "http://example.test/" and
  .captureStrategy == "reuse-page" and
  .captureGroups["main-page-after-intro"].resetScroll == true and
  any(.captures[]; .id == "boot-load-reveals" and .type == "boot") and
  any(.captures[]; .type == "scroll-reveal" and .root == "#cta") and
  any(.captures[]; .type == "hover") and
  any(.captures[]; .id == "accordion-click" and .root == "div.accordion-css__item" and .action == "click button.accordion-css__item-trigger" and .fresh == true) and
  any(.captures[]; .type == "hover" and .group == "main-page-after-intro") and
  all(.captures[]; .root != "a" and .action != "hover a")
' "$TMP_ASSEMBLE/manifest.proposed.json" >/dev/null
test -s "$TMP_ASSEMBLE/capture-plan.md"
"$ROOT/bin/motion-decompile" assemble "$TMP_ASSEMBLE" >/dev/null
jq -e '
  .meta.url == "http://example.test/" and
  (.animations | length) >= 5 and
  any(.patterns[]; .id == "p-scroll-scrub") and
  any(.animations[]; .id == "fixture-click" and .trigger == "click" and .lead.from.height == "0px" and .timelineRef == "timelines/fixture-click.json") and
  any(.animations[]; .id == "empty-scroll" and .empty == true and .confidence == "unknown - verify")
' "$TMP_ASSEMBLE/animations.json" >/dev/null
test -s "$TMP_ASSEMBLE/animations.md"
"$ROOT/bin/motion-decompile" report "$TMP_ASSEMBLE" >/dev/null
grep -q 'Page State' "$TMP_ASSEMBLE/report.md"
grep -q 'timeout-loading' "$TMP_ASSEMBLE/report.md"
grep -q 'Empty Captures' "$TMP_ASSEMBLE/report.md"
grep -q 'empty-scroll' "$TMP_ASSEMBLE/report.md"
grep -q 'Failed Captures' "$TMP_ASSEMBLE/report.md"
grep -q 'failed-hover' "$TMP_ASSEMBLE/report.md"

# --- calib-metrics reads the structured `cause` field (legacy keyword map is
# --- only a fallback); map.dominantIframe populates wrong_document. -----------
CAUSE_DIR="$(mktemp -d)"
cat >"$CAUSE_DIR/map.json" <<'JSON'
{ "libs": ["GSAP", "ScrollTrigger"],
  "dominantIframe": { "src": "https://report.example.net/", "sameOrigin": false, "accessible": false, "areaRatio": 0.97 } }
JSON
cat >"$CAUSE_DIR/capture-results.json" <<'JSON'
{ "capturedAt": "2026-06-15T00:00:00.000Z", "count": 4, "results": [
  { "id": "u1", "type": "hover", "status": "empty", "cause": "pseudo_element", "summary": "no animation captured", "findings": 0 },
  { "id": "shell", "type": "hover", "status": "error", "cause": "wrong_document_iframe", "error": "selector matched no visible elements", "findings": 0 },
  { "id": "boot", "type": "boot", "status": "empty", "cause": "wrong_trigger_boot_vs_scroll", "summary": "no animation captured", "findings": 0 },
  { "id": "legacy", "type": "hover", "status": "error", "error": "is covered by another element", "findings": 0 }
] }
JSON
"$ROOT/bin/calib-metrics" "$CAUSE_DIR" --site cause-fixture >/dev/null
jq -e '
  .failure_causes.pseudo_element == 1 and
  .failure_causes.wrong_document_iframe == 1 and
  .failure_causes.wrong_trigger_boot_vs_scroll == 1 and
  .failure_causes.occlusion == 1 and
  .wrong_document == "https://report.example.net/"
' "$CAUSE_DIR/metrics.json" >/dev/null
rm -rf "$CAUSE_DIR"

REUSE_MANIFEST="$TMP_ASSEMBLE/reuse-manifest.json"
cat >"$REUSE_MANIFEST" <<JSON
{
  "url": "$URL",
  "viewport": [800, 600],
  "captureStrategy": "reuse-page",
  "readyTimeoutMs": 1500,
  "readyStableMs": 100,
  "openDelayMs": 0,
  "captureInitialWaitMs": 200,
  "captureGroups": {
    "reuse-smoke": {
      "resetScroll": true
    }
  },
  "captures": [
    {
      "id": "reuse-boot",
      "type": "boot",
      "fresh": true,
      "seedReuse": true,
      "seedGroup": "reuse-smoke",
      "boot": { "selectors": ["#gsap-box"], "ms": 120 },
      "waitMs": 220
    },
    {
      "id": "reuse-one",
      "type": "manual",
      "root": "#multi",
      "group": "reuse-smoke",
      "waitMs": 650,
      "action": { "eval": "document.querySelector('#multi').classList.add('active')" }
    },
    {
      "id": "reuse-two",
      "type": "manual",
      "root": "#stagger",
      "group": "reuse-smoke",
      "waitMs": 900,
      "action": { "eval": "document.querySelector('#stagger').classList.add('active')" }
    }
  ]
}
JSON
REUSE_OUT="$(
  AGENT_BROWSER_SESSION="motion-smoke-reuse-$$" \
    "$ROOT/bin/motion-decompile" run "$REUSE_MANIFEST" \
      --runs-dir "$TMP_ASSEMBLE/reuse-runs" \
      --slug reuse \
      --ready-timeout-ms 1500 \
      --ready-stable-ms 100 \
      --open-delay-ms 0
)"
REUSE_RUN="$(printf '%s\n' "$REUSE_OUT" | awk '/^Run:/ {print $2}')"
jq -e '
  .count == 3 and
  .results[0].page.strategy == "fresh" and
  .results[0].page.seededReusablePage == true and
  .results[0].page.seedGroup == "reuse-smoke" and
  .results[1].page.strategy == "reuse-page" and
  .results[1].page.opened == false
  and .results[1].page.seededBy == "reuse-boot" and
  .results[2].page.strategy == "reuse-page" and
  .results[2].page.opened == false
' "$REUSE_RUN/capture-results.json" >/dev/null
jq -e '[.records[] | select(.phase | startswith("capture:"))] | length == 1' "$REUSE_RUN/page-state.json" >/dev/null
grep -q 'reuse-page / reuse-smoke / reused' "$REUSE_RUN/report.md"
