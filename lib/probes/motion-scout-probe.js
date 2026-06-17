(function () {
  'use strict';

  function unique(values) {
    var seen = {};
    return values.filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function esc(value) {
    return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value);
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && !/^w-node-/i.test(el.id)) return '#' + esc(el.id);
    var tag = el.tagName.toLowerCase();
    var classes = Array.prototype.slice.call(el.classList || [])
      .filter(function (cls) { return !/^w-node-/i.test(cls); })
      .slice(0, 3)
      .map(function (cls) { return '.' + esc(cls); })
      .join('');
    return tag + classes;
  }

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity || 1) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function selectorsFor(query, limit) {
    return unique(Array.prototype.slice.call(document.querySelectorAll(query))
      .filter(visible)
      .map(cssPath)
      .filter(Boolean))
      .slice(0, limit || 60);
  }

  function cssKeyframes() {
    return unique(Array.prototype.slice.call(document.querySelectorAll('*'))
      .filter(visible)
      .map(function (el) {
        var cs = getComputedStyle(el);
        if (!cs.animationName || cs.animationName === 'none') return null;
        if (String(cs.animationIterationCount || '').toLowerCase() === 'infinite') return null;
        return cssPath(el);
      })
      .filter(Boolean))
      .slice(0, 40);
  }

  function cursorCandidates() {
    return unique(Array.prototype.slice.call(document.querySelectorAll('*'))
      .filter(visible)
      .map(function (el) {
        var cs = getComputedStyle(el);
        var cursor = String(cs.cursor || '').toLowerCase();
        if (cursor && !['auto', 'default', 'text', 'initial', 'inherit'].includes(cursor)) return cssPath(el);
        if (/cursor/i.test(String(el.className || '') + ' ' + String(el.id || ''))) return cssPath(el);
        return null;
      })
      .filter(Boolean))
      .slice(0, 40);
  }

  function stickyCandidates() {
    return unique(Array.prototype.slice.call(document.querySelectorAll('*'))
      .filter(visible)
      .map(function (el) {
        var cs = getComputedStyle(el);
        var marker = String(el.className || '') + ' ' + String(el.id || '');
        if (cs.position === 'sticky' || cs.position === 'fixed' || /pin|sticky/i.test(marker)) return cssPath(el);
        return null;
      })
      .filter(Boolean))
      .slice(0, 40);
  }

  function runMotionScoutProbe() {
    var base = {};
    if (window.__cap && typeof window.__cap.map === 'function') {
      base = window.__cap.map() || {};
    }
    return Object.assign({}, base, {
      clickCandidates: selectorsFor('[onclick], button, [role="button"], [aria-expanded], details summary, [class*="accordion"], [class*="toggle"], [class*="modal"]', 60),
      cursorCandidates: cursorCandidates(),
      stickyCandidates: stickyCandidates(),
      cssKeyframes: cssKeyframes()
    });
  }

  window.__yoinkitMotionScoutProbe = runMotionScoutProbe;
}());
