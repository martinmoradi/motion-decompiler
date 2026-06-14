/* ============================================================================
 * capture-animation.js  —  web animation decompiler (Chrome DevTools Snippet)
 * ----------------------------------------------------------------------------
 * Reads what an animation ACTUALLY does by sampling computed style over time,
 * regardless of how it is driven (CSS transition/keyframes, GSAP rAF inline
 * transforms, CSS sprite steps()). The DevTools "Animations" panel only sees
 * CSS/WAAPI; this sees everything because it reads the rendered result.
 *
 * USAGE (paste into Sources > Snippets, hit Run once, then drive from Console):
 *
 *   __cap.libs()                         // which animation libs are loaded
 *   __cap.on('.selector')                // arm on hover (default trigger)
 *   __cap.on('.selector', {trigger:'scroll'})   // arm on scroll-into-view
 *   __cap.scan('.section')               // diff-scan: find what moves in a region
 *                                        //   (for layers you cannot click —
 *                                        //    pointer-events:none, behind text)
 *   // ...now hover / scroll the thing...
 *   __cap.dump()                         // finalize -> copies .animation.json
 *
 * Triggers: 'hover' (default) | 'scroll' | 'load' | 'manual'
 * Output: a SPEC (not code) — { summary, findings[] } with per-layer measured
 *         timing/easing + frame timeline. Pure JSON to clipboard + window.__capLast.
 *         Hand it to an LLM to write the recreation in your stack.
 * ========================================================================== */
(() => {
  const PROPS = ['transform', 'opacity', 'filter', 'clipPath',
                 'backgroundPosition', 'backgroundColor', 'color'];
  const SETTLE_MS = 220;     // stop after this much no-change (once something moved)
  const MAX_MS = 6000;       // hard cap
  const SCAN_THROTTLE_MS = 30;

  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;
  const r3 = n => Math.round(n * 1000) / 1000;
  const now = () => performance.now();

  /* ---- library detection ------------------------------------------------ */
  function detectLibs() {
    return Object.entries({
      GSAP: !!window.gsap,
      ScrollTrigger: !!(window.ScrollTrigger || (window.gsap && window.gsap.ScrollTrigger)),
      Lenis: !!(window.Lenis || window.lenis),
      'Three.js': !!window.THREE,
      Motion: !!window.Motion,
      'Framer Motion': !!document.querySelector('[data-projection-id],[data-framer-name]'),
      Webflow: !!window.Webflow,
      jQuery: !!window.jQuery,
      Lottie: !!(window.lottie || window.bodymovin),
      anime: !!window.anime,
    }).filter(([, v]) => v).map(([k]) => k);
  }

  /* ---- transform matrix -> readable parts ------------------------------- */
  function decodeTransform(str) {
    if (!str || str === 'none') return { kind: 'none' };
    const m = str.match(/matrix(3d)?\(([^)]+)\)/);
    if (!m) return { raw: str };
    const v = m[2].split(',').map(parseFloat);
    if (!m[1]) {
      const [a, b, c, d, e, f] = v;
      return {
        scaleX: r3(Math.hypot(a, b)), scaleY: r3(Math.hypot(c, d)),
        rotate: r1(Math.atan2(b, a) * 180 / Math.PI),
        x: r2(e), y: r2(f),
      };
    }
    const sx = Math.hypot(v[0], v[1], v[2]) || 1;
    const sy = Math.hypot(v[4], v[5], v[6]) || 1;
    const sz = Math.hypot(v[8], v[9], v[10]) || 1;
    const R = [
      [v[0] / sx, v[4] / sy, v[8] / sz],
      [v[1] / sx, v[5] / sy, v[9] / sz],
      [v[2] / sx, v[6] / sy, v[10] / sz],
    ];
    const ry = Math.asin(Math.max(-1, Math.min(1, -R[2][0])));
    let rx, rz;
    if (Math.abs(R[2][0]) < 0.9999) { rx = Math.atan2(R[2][1], R[2][2]); rz = Math.atan2(R[1][0], R[0][0]); }
    else { rx = Math.atan2(-R[1][2], R[1][1]); rz = 0; }
    const deg = rad => r1(rad * 180 / Math.PI);
    return {
      scaleX: r3(sx), scaleY: r3(sy), scaleZ: r3(sz),
      rotateX: deg(rx), rotateY: deg(ry), rotateZ: deg(rz),
      x: r2(v[12]), y: r2(v[13]), z: r2(v[14]), _approx3d: true,
    };
  }

  /* ---- element / target resolution -------------------------------------- */
  const resolve = t => typeof t === 'string' ? document.querySelector(t) : t;

  // A target is a "stagger group" if it has several similar leaf-ish children
  // (e.g. split text: many .stagger-char divs). Returns child elements or null.
  function staggerChildren(el) {
    const kids = [...el.children];
    if (kids.length < 3) return null;
    const sameTag = kids.every(k => k.tagName === kids[0].tagName);
    const cls = kids[0].classList[0];
    const sameClass = cls && kids.every(k => k.classList.contains(cls));
    const leafish = kids.every(k => k.children.length <= 1);
    return (sameTag && sameClass && leafish) ? kids : null;
  }

  // Split a CSS list on TOP-LEVEL commas only, so cubic-bezier(0.3, 0.7, ...)
  // stays intact instead of being shredded by a naive split(',').
  function splitTop(str) {
    const out = []; let depth = 0, cur = '';
    for (const ch of str) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /* ---- authoritative easing/duration for CSS transitions ---------------- */
  function cssTiming(el, prop) {
    const cs = getComputedStyle(el);
    const props = splitTop(cs.transitionProperty);
    const idx = props.findIndex(p => p === prop || p === 'all');
    if (idx === -1) return null;
    const durs = splitTop(cs.transitionDuration);
    const tims = splitTop(cs.transitionTimingFunction);
    const pick = (a, i) => a[i % a.length];
    const dur = pick(durs, idx);
    if (dur === '0s') return null;
    return { duration: dur, easing: pick(tims, idx) };
  }

  /* ====================================================================== */
  const S = { armed: false, mode: null, t0: 0, raf: 0, tracks: [], cleanup: [],
              started: false, lastChange: 0, root: null, candidates: null,
              baseline: null, lastScan: 0 };

  function readVals(el) {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of PROPS) o[p] = cs[p];
    return o;
  }

  function track(el) {
    const t = { el, sel: cssPath(el), frames: [] };
    S.tracks.push(t);
    return t;
  }

  function pushFrame(t, vals) {
    const last = t.frames[t.frames.length - 1];
    if (!last || PROPS.some(p => last.vals[p] !== vals[p])) {
      t.frames.push({ t: r1(now() - S.t0), vals });
      S.lastChange = now();
    }
  }

  function loopSingle() {
    for (const t of S.tracks) pushFrame(t, readVals(t.el));
    const elapsed = now() - S.t0;
    const settled = S.lastChange && (now() - S.lastChange > SETTLE_MS) &&
                    S.tracks.some(t => t.frames.length > 1);
    if (elapsed > MAX_MS || settled) return finish();
    S.raf = requestAnimationFrame(loopSingle);
  }

  function loopScan() {
    const tnow = now();
    if (tnow - S.lastScan >= SCAN_THROTTLE_MS) {
      S.lastScan = tnow;
      for (let i = 0; i < S.candidates.length; i++) {
        const el = S.candidates[i];
        const vals = readVals(el);
        const base = S.baseline[i];
        if (PROPS.some(p => base[p] !== vals[p])) {
          let t = S.tracks.find(x => x.el === el);
          if (!t) { t = track(el); t.frames.push({ t: 0, vals: base }); }
          pushFrame(t, vals);
        }
      }
    }
    const elapsed = tnow - S.t0;
    const settled = S.lastChange && (tnow - S.lastChange > SETTLE_MS) && S.tracks.length;
    if (elapsed > MAX_MS || settled) return finish();
    S.raf = requestAnimationFrame(loopScan);
  }

  function start() {
    if (S.started) return;
    S.started = true; S.t0 = now(); S.lastChange = 0; S.lastScan = 0;
    if (S.mode === 'scan') {
      S.baseline = S.candidates.map(readVals);
      S.raf = requestAnimationFrame(loopScan);
    } else {
      // snapshot the true rest state as frame 0, before the trigger moves it
      for (const t of S.tracks) t.frames.push({ t: 0, vals: readVals(t.el) });
      S.raf = requestAnimationFrame(loopSingle);
    }
    console.log('%c[capture] recording…', 'color:#fa0', 'interact now, then run __cap.dump()');
  }

  function arm(trigger, triggerEl) {
    S.armed = true; S.started = false;
    if (trigger === 'manual' || trigger === 'load') { start(); return; }
    if (trigger === 'scroll') {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) start(); },
                                          { threshold: 0.25 });
      io.observe(triggerEl); S.cleanup.push(() => io.disconnect());
      console.log('%c[capture] armed (scroll)', 'color:#0af', 'scroll the element into view');
    } else { // hover
      const h = () => start();
      triggerEl.addEventListener('mouseenter', h, { once: true });
      S.cleanup.push(() => triggerEl.removeEventListener('mouseenter', h));
      console.log('%c[capture] armed (hover)', 'color:#0af', 'hover the element');
    }
  }

  function finish() {
    cancelAnimationFrame(S.raf); S.raf = 0;
    const moved = S.tracks.filter(t => t.frames.length > 1);
    console.log(`%c[capture] done — ${moved.length} element(s) moved. Run __cap.dump()`,
                'color:#0c0');
  }

  /* ---- analysis: turn a track's frames into a finding ------------------- */
  function analyze(t) {
    const f = t.frames;
    const changed = p => f.some(fr => fr.vals[p] !== f[0].vals[p]);
    const cs = getComputedStyle(t.el);
    const out = { selector: t.sel, frameCount: f.length };

    // sprite sheet (stepped background-position)
    if (changed('backgroundPosition') && (/steps/.test(cs.animationTimingFunction) ||
        /sprite/i.test(t.el.className))) {
      const positions = [...new Set(f.map(fr => fr.vals.backgroundPosition))];
      out.type = 'css-sprite';
      out.technique = `CSS sprite-sheet: ${positions.length} frames stepped via background-position`;
      out.spriteSheet = cs.backgroundImage.replace(/^url\(["']?|["']?\)$/g, '');
      out.backgroundSize = cs.backgroundSize;
      out.animation = { name: cs.animationName, duration: cs.animationDuration,
                        timing: cs.animationTimingFunction, iteration: cs.animationIterationCount };
      out.fps = r1(positions.length / (parseFloat(cs.animationDuration) || 1));
      out.framePositions = positions;
      return out;
    }

    // transform-driven
    if (changed('transform')) {
      const a = decodeTransform(f[0].vals.transform);
      const b = decodeTransform(f[f.length - 1].vals.transform);
      out.type = 'transform';
      out.from = a; out.to = b;
      out.timing = cssTiming(t.el, 'transform') || { duration: `${r1((f[f.length-1].t)/1000*1000)/1000}s (measured)`, easing: 'unknown (rAF/JS) — verify' };
      out.technique = describeTransform(a, b);
      out.timeline = downsample(f, fr => decodeTransform(fr.vals.transform));
      return out;
    }

    // opacity / color / filter fallback
    for (const p of ['opacity', 'filter', 'clipPath', 'backgroundColor', 'color']) {
      if (changed(p)) {
        out.type = p;
        out.from = f[0].vals[p]; out.to = f[f.length - 1].vals[p];
        out.timing = cssTiming(t.el, p) || { duration: 'measured', easing: 'verify' };
        out.technique = `${p}: ${out.from} -> ${out.to}`;
        out.timeline = downsample(f, fr => fr.vals[p]);
        return out;
      }
    }
    out.type = 'none'; return out;
  }

  function describeTransform(a, b) {
    const bits = [];
    if (a.scaleX !== undefined && b.scaleX !== undefined && Math.abs(a.scaleX - b.scaleX) > 0.01)
      bits.push(`scale ${a.scaleX}->${b.scaleX}`);
    if ((a.y || 0) !== (b.y || 0)) bits.push(`y ${a.y || 0}->${b.y || 0}px`);
    if ((a.x || 0) !== (b.x || 0)) bits.push(`x ${a.x || 0}->${b.x || 0}px`);
    ['rotate', 'rotateX', 'rotateY', 'rotateZ'].forEach(k => {
      if (a[k] !== undefined && Math.abs((a[k] || 0) - (b[k] || 0)) > 0.5)
        bits.push(`${k} ${a[k] || 0}->${b[k] || 0}deg`);
    });
    return bits.length ? bits.join(', ') : 'transform change';
  }

  function downsample(frames, map, n = 12) {
    if (frames.length <= n) return frames.map(fr => ({ t: fr.t, v: map(fr) }));
    const step = (frames.length - 1) / (n - 1), out = [];
    for (let i = 0; i < n; i++) { const fr = frames[Math.round(i * step)]; out.push({ t: fr.t, v: map(fr) }); }
    return out;
  }

  /* ---- stagger detection across multiple tracks ------------------------- */
  function staggerSummary(findings) {
    const tf = findings.filter(x => x.type === 'transform');
    if (tf.length < 3) return null;
    // peak time per item (largest |y| or |scale delta|)
    const peaks = tf.map((x, i) => {
      let max = 0, tp = 0;
      (x.timeline || []).forEach(s => {
        const y = Math.abs(s.v.y || 0), sc = Math.abs((s.v.scaleX ?? 1) - 1);
        const mag = Math.max(y, sc * 100);
        if (mag > max) { max = mag; tp = s.t; }
      });
      return { i, tPeak: tp };
    }).sort((a, b) => a.tPeak - b.tPeak);
    const deltas = [];
    for (let i = 1; i < peaks.length; i++) deltas.push(peaks[i].tPeak - peaks[i - 1].tPeak);
    const stagger = deltas.length ? r1(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
    return { items: tf.length, staggerMs: stagger,
             order: peaks.map(p => p.i) };
  }

  /* ---- whole-animation plain-English summary ---------------------------- */
  // The spec is the product; an LLM writes the recreation from it. This sentence
  // describes the ENTIRE captured animation (all layers), not just the first.
  function summarize(findings, stagger) {
    if (!findings.length) return 'no animation captured';
    if (findings.length === 1 && findings[0].type === 'css-sprite') {
      const f = findings[0];
      return `CSS sprite-sheet: ${f.framePositions.length} frames at ~${f.fps}fps, looping (${f.animation.duration} ${f.animation.timing}).`;
    }
    if (stagger) {
      const f = findings[0], t = f.timing || {};
      return `Staggered ${stagger.items}-item animation (e.g. split text): each item ${f.technique}, ~${stagger.staggerMs}ms apart, ${t.duration || '?'} ${t.easing || ''}.`.trim();
    }
    const t = findings[0].timing || {};
    const parts = findings.map(f => `${f.selector} [${f.technique}]`);
    const lead = findings.length === 1 ? 'One element animates' : `${findings.length} layers animate together`;
    return `${lead}: ${parts.join('; ')} — ${t.duration || '?'} ${t.easing || ''}.`.trim();
  }

  /* ---- short CSS path for an element ------------------------------------ */
  function cssPath(el) {
    if (el.id) return '#' + el.id;
    const cls = [...el.classList].slice(0, 2).map(c => '.' + c).join('');
    return el.tagName.toLowerCase() + cls;
  }

  /* ---- public API ------------------------------------------------------- */
  function reset() {
    cancelAnimationFrame(S.raf);
    S.cleanup.forEach(fn => fn()); S.cleanup = [];
    Object.assign(S, { armed: false, mode: null, t0: 0, raf: 0, tracks: [],
      started: false, lastChange: 0, root: null, candidates: null, baseline: null, lastScan: 0 });
  }

  const api = {
    libs: () => { const l = detectLibs(); console.log('%c[capture] libs:', 'color:#0af', l.join(', ') || '(none)'); return l; },
    on(target, opts = {}) {
      reset();
      const el = resolve(target);
      if (!el) { console.warn('[capture] no element for', target); return; }
      S.mode = 'single';
      const kids = staggerChildren(el);
      (kids || [el]).forEach(track);
      console.log(`[capture] tracking ${kids ? kids.length + ' child items (stagger)' : '1 element'}`);
      arm(opts.trigger || 'hover', el);
      return this;
    },
    scan(target, opts = {}) {
      reset();
      const root = resolve(target) || document.body;
      S.mode = 'scan'; S.root = root;
      S.candidates = [root, ...root.querySelectorAll('*')].slice(0, 4000);
      if (S.candidates.length === 4000) console.warn('[capture] scan capped at 4000 elements — pass a tighter root');
      console.log(`[capture] scanning ${S.candidates.length} elements under`, cssPath(root));
      arm(opts.trigger || 'hover', root);
      return this;
    },
    dump(opts = {}) {
      if (S.raf) finish();
      const moved = S.tracks.filter(t => t.frames.length > 1);
      const findings = moved.map(analyze).filter(x => x.type !== 'none');
      const stagger = staggerSummary(findings);
      const report = {
        meta: {
          source: location.href,
          capturedFrom: 'capture-animation.js',
          libraries: detectLibs(),
          mode: S.mode,
          elementsMoved: findings.length,
        },
        summary: summarize(findings, stagger),
        stagger,
        findings: stagger ? [findings[0], { note: `+${findings.length - 1} sibling items animate identically, ~${stagger.staggerMs}ms apart` }] : findings,
      };
      const json = JSON.stringify(report, null, 2);
      // Pure spec JSON to the clipboard — an LLM (or you) writes the code from it.
      const copied = (() => {
        try { navigator.clipboard.writeText(json); return 'clipboard'; } catch (e) {}
        try { if (typeof copy === 'function') { copy(report); return 'clipboard (copy())'; } } catch (e) {}
        return 'console only';
      })();
      window.__capLast = report;            // re-readable by an agent via MCP
      console.log(`%c[capture] ${report.summary}`, 'color:#0c0;font-weight:bold');
      console.log(`%c[capture] ${findings.length} finding(s) -> ${copied} · also at window.__capLast`, 'color:#0a0');
      console.log(json);
      return report;
    },
    stop: reset,
  };

  /* ---- interactive element picker (toolbar-button driven) --------------- */
  // Click the toolbar button -> picker ON. Hover an element so its animation
  // plays, then click it: we capture that element's subtree and dump (console
  // + clipboard). Esc cancels. The hover-then-click gesture naturally triggers
  // hover animations while you aim.
  const picker = (() => {
    let active = false, target = null, box, label, bar;
    // For hover effects the moving part is usually the element or a descendant
    // of the interactive ancestor — capture from there so we don't miss it.
    const pickRoot = el => el.closest('a, button, [role="button"]') || el;

    function ensureUI() {
      if (box) return;
      const base = { position: 'fixed', zIndex: 2147483647, pointerEvents: 'none' };
      box = document.createElement('div');
      Object.assign(box.style, base, { background: 'rgba(25,160,255,.22)',
        border: '1px solid #19a0ff', boxShadow: '0 0 0 1px rgba(255,255,255,.6)',
        borderRadius: '2px', display: 'none' });
      label = document.createElement('div');
      Object.assign(label.style, base, { font: '11px/1.4 monospace', background: '#19a0ff',
        color: '#fff', padding: '1px 5px', borderRadius: '3px', display: 'none', whiteSpace: 'nowrap' });
      bar = document.createElement('div');
      Object.assign(bar.style, base, { left: '50%', top: '12px', transform: 'translateX(-50%)',
        font: '12px/1.4 system-ui,sans-serif', background: '#16181d', color: '#fff',
        padding: '6px 12px', borderRadius: '6px', boxShadow: '0 2px 12px rgba(0,0,0,.45)' });
      bar.textContent = '🎯 hover an element so it animates, then click it · Esc to cancel';
      document.documentElement.append(box, label, bar);
    }
    function highlight(el) {
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px',
        width: r.width + 'px', height: r.height + 'px' });
      label.style.display = 'block';
      label.textContent = cssPath(pickRoot(el));
      label.style.left = r.left + 'px';
      label.style.top = Math.max(0, r.top - 20) + 'px';
    }
    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === box || el === label || el === bar) return;
      highlight(el);
      const root = pickRoot(el);
      if (root !== target) { target = root; api.scan(target, { trigger: 'manual' }); }
    }
    const swallow = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    function onClick(e) {
      swallow(e);
      const picked = target;
      disable();
      if (!picked) return;
      console.log('%c[capture] picked ' + cssPath(picked), 'color:#19a0ff;font-weight:bold');
      api.dump();
    }
    function onKey(e) {
      if (e.key === 'Escape') { swallow(e); api.stop(); disable(); console.log('[capture] picker cancelled'); }
    }
    function enable() {
      if (active) return; active = true; ensureUI();
      box.style.display = 'none'; label.style.display = 'none'; bar.style.display = 'block';
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('mousedown', swallow, true);
      document.addEventListener('mouseup', swallow, true);
      document.addEventListener('keydown', onKey, true);
      console.log('%c[capture] picker ON — aim and click', 'color:#19a0ff;font-weight:bold');
    }
    function disable() {
      if (!active) return; active = false; target = null;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', swallow, true);
      document.removeEventListener('mouseup', swallow, true);
      document.removeEventListener('keydown', onKey, true);
      if (box) { box.style.display = 'none'; label.style.display = 'none'; bar.style.display = 'none'; }
    }
    return { enable, disable, toggle() { active ? disable() : enable(); } };
  })();
  api.pick = () => picker.enable();

  window.__cap = api;
  window.__capPicker = picker;
  console.log('%c[capture] ready', 'color:#0c0;font-weight:bold',
    '— toolbar button or __cap.pick() · __cap.on/scan/dump · __cap.libs()');
})();
