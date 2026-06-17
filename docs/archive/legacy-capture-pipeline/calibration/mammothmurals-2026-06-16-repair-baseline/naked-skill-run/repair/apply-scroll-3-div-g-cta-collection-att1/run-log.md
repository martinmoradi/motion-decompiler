# motion-decompile run log

Started: 2026-06-16T02:50:45.251Z


Using manifest: `/home/martin/src/perso/motion-decompiler/runs/mammothmurals.com/2026-06-16-run/repair/apply-scroll-3-div-g-cta-collection-att1/apply-manifest.json`

Capture strategy: `reuse-page`


## Capture scroll-3-div-g-cta-collection

Type: `scroll-reveal`

- 2026-06-16T02:50:45.254Z `./bin/capture-browser close --all`
- 2026-06-16T02:50:45.709Z `./bin/capture-browser open https://mammothmurals.com/ --headed --init-script /home/martin/src/perso/motion-decompiler/extension/capture-animation.js`
- 2026-06-16T02:50:46.691Z `./bin/capture-browser set viewport 1280 800`
- 2026-06-16T02:50:46.701Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:46.957Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:47.212Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:47.468Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:47.723Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:47.978Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:48.233Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`

Page readiness capture:scroll-3-div-g-cta-collection:open: ready (complete, text 5280, elements 1102).

- 2026-06-16T02:50:48.238Z `./bin/capture-browser wait 1500`
- 2026-06-16T02:50:49.742Z `./bin/capture-browser eval '(() => { try {
      if (window.lenis && typeof window.lenis.scrollTo === '\''function'\'') window.lenis.scrollTo(0, { immediate: true, force: true });
    } catch...' --max-output 200000`
- 2026-06-16T02:50:49.748Z `./bin/capture-browser wait 250`
- 2026-06-16T02:50:50.005Z `./bin/capture-browser eval '(() => { window.__cap.scan("div.g_cta_content", { trigger: "scroll", captureSource: "scroll-3-div-g-cta-collection" }); return { ok: true }; })()' --max-output 200000`
- 2026-06-16T02:50:50.009Z `./bin/capture-browser eval '(() => {
    const selector = "div.g_cta_content";
    const matches = Array.from(document.querySelectorAll(selector));
    const visibleCount = matches.filt...' --max-output 300000`
- 2026-06-16T02:50:50.012Z `./bin/capture-browser scrollintoview div.g_cta_content`
- 2026-06-16T02:50:50.016Z `./bin/capture-browser wait 1600`
- 2026-06-16T02:50:51.621Z `./bin/capture-browser eval '(() => window.__cap.dump({ copy: false }))()' --max-output 5000000`

Saved 1 timeline(s); 1 capture result(s).

