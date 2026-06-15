#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="motion-smoke-$$"
SERVER_LOG="$(mktemp)"
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

cleanup() {
  "${AB[@]}" --session "$SESSION" close --all >/dev/null 2>&1 || true
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
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
