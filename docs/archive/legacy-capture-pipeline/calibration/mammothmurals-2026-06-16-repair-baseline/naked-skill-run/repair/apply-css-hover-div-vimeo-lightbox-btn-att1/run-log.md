# motion-decompile run log

Started: 2026-06-16T02:50:51.681Z


Using manifest: `/home/martin/src/perso/motion-decompiler/runs/mammothmurals.com/2026-06-16-run/repair/apply-css-hover-div-vimeo-lightbox-btn-att1/apply-manifest.json`

Capture strategy: `reuse-page`


## Capture css-hover-div-vimeo-lightbox-btn

Type: `hover`

- 2026-06-16T02:50:51.683Z `./bin/capture-browser close --all`
- 2026-06-16T02:50:52.138Z `./bin/capture-browser open https://mammothmurals.com/ --headed --init-script /home/martin/src/perso/motion-decompiler/extension/capture-animation.js`
- 2026-06-16T02:50:53.078Z `./bin/capture-browser set viewport 1280 800`
- 2026-06-16T02:50:53.086Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:53.344Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:53.599Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:53.855Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:54.109Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:54.363Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:54.618Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`

Page readiness capture:css-hover-div-vimeo-lightbox-btn:open: ready (complete, text 5280, elements 1102).

- 2026-06-16T02:50:54.624Z `./bin/capture-browser wait 1500`
- 2026-06-16T02:50:56.128Z `./bin/capture-browser click button.g_video_button`
- 2026-06-16T02:50:56.146Z `./bin/capture-browser wait 500`
- 2026-06-16T02:50:56.651Z `./bin/capture-browser eval '(() => {
    const selector = "div.vimeo-lightbox__btn";
    const matches = Array.from(document.querySelectorAll(selector));
    const visibleCount = matche...' --max-output 300000`
- 2026-06-16T02:50:56.655Z `./bin/capture-browser scrollintoview div.vimeo-lightbox__btn`
- 2026-06-16T02:50:56.658Z `./bin/capture-browser wait 250`
- 2026-06-16T02:50:56.912Z `./bin/capture-browser mouse move 1 1`
- 2026-06-16T02:50:56.925Z `./bin/capture-browser eval '(() => { window.__cap.scan("div.vimeo-lightbox__btn", { trigger: "hover", captureSource: "css-hover-div-vimeo-lightbox-btn" }); return { ok: true }; })()' --max-output 200000`
- 2026-06-16T02:50:56.928Z `./bin/capture-browser eval '(() => {
    const selector = "div.vimeo-lightbox__btn";
    const cssPath = el => {
      if (!el || el.nodeType !== 1) return '\'''\'';
      if (el.id) return '\''...' --max-output 500000`

Capture failed: Preflight failed for hover div.vimeo-lightbox__btn: selector center is covered by path

- 2026-06-16T02:50:56.932Z `./bin/capture-browser eval '(() => {
    const selector = "div.vimeo-lightbox__btn";
    const bootSelectors = [];
    const ANIM = /transform|opacity|filter|clip-path|clip|width|height...' --max-output 600000`
Cause for css-hover-div-vimeo-lightbox-btn: `occlusion`


Saved 0 timeline(s); 1 capture result(s).

