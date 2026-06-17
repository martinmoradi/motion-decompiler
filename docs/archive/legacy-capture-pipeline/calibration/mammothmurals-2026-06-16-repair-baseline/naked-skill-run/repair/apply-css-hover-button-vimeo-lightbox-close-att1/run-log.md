# motion-decompile run log

Started: 2026-06-16T02:50:56.987Z


Using manifest: `/home/martin/src/perso/motion-decompiler/runs/mammothmurals.com/2026-06-16-run/repair/apply-css-hover-button-vimeo-lightbox-close-att1/apply-manifest.json`

Capture strategy: `reuse-page`


## Capture css-hover-button-vimeo-lightbox-close

Type: `hover`

- 2026-06-16T02:50:56.989Z `./bin/capture-browser close --all`
- 2026-06-16T02:50:57.445Z `./bin/capture-browser open https://mammothmurals.com/ --headed --init-script /home/martin/src/perso/motion-decompiler/extension/capture-animation.js`
- 2026-06-16T02:50:58.407Z `./bin/capture-browser set viewport 1280 800`
- 2026-06-16T02:50:58.417Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:58.675Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:58.932Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:59.186Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:59.441Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:59.697Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`
- 2026-06-16T02:50:59.951Z `./bin/capture-browser eval '(() => {
    const textOf = el => (el && (el.innerText || el.textContent) || '\'''\'').replace(/\s+/g, '\'' '\'').trim();
    const short = value => String(value || '\'''\'')....' --max-output 700000`

Page readiness capture:css-hover-button-vimeo-lightbox-close:open: ready (complete, text 5280, elements 1102).

- 2026-06-16T02:50:59.956Z `./bin/capture-browser wait 1500`
- 2026-06-16T02:51:01.461Z `./bin/capture-browser click button.g_video_button`
- 2026-06-16T02:51:01.483Z `./bin/capture-browser wait 500`
- 2026-06-16T02:51:01.988Z `./bin/capture-browser eval '(() => {
    const selector = "button.vimeo-lightbox__close";
    const matches = Array.from(document.querySelectorAll(selector));
    const visibleCount = m...' --max-output 300000`
- 2026-06-16T02:51:01.992Z `./bin/capture-browser scrollintoview button.vimeo-lightbox__close`
- 2026-06-16T02:51:01.995Z `./bin/capture-browser wait 250`
- 2026-06-16T02:51:02.250Z `./bin/capture-browser mouse move 1 1`
- 2026-06-16T02:51:02.262Z `./bin/capture-browser eval '(() => { window.__cap.scan("button.vimeo-lightbox__close", { trigger: "hover", captureSource: "css-hover-button-vimeo-lightbox-close" }); return { ok: true }...' --max-output 200000`
- 2026-06-16T02:51:02.266Z `./bin/capture-browser eval '(() => {
    const selector = "button.vimeo-lightbox__close";
    const cssPath = el => {
      if (!el || el.nodeType !== 1) return '\'''\'';
      if (el.id) ret...' --max-output 500000`
- 2026-06-16T02:51:02.269Z `./bin/capture-browser hover button.vimeo-lightbox__close`
- 2026-06-16T02:51:02.280Z `./bin/capture-browser wait 1150`
- 2026-06-16T02:51:03.433Z `./bin/capture-browser eval '(() => window.__cap.dump({ copy: false }))()' --max-output 5000000`

Saved 1 timeline(s); 1 capture result(s).

