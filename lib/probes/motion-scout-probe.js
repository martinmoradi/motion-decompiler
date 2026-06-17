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

  function inspection(source, status, evidence, reason) {
    return {
      source: source,
      status: status,
      attempted: true,
      completed: status === 'complete',
      evidence: evidence || '',
      reason: reason || null
    };
  }

  function inspectSource(inspections, source, evidence, fn, fallback) {
    try {
      var value = fn();
      inspections.push(inspection(source, 'complete', evidence));
      return value;
    } catch (error) {
      inspections.push(inspection(source, 'missing', '', error && error.message ? error.message : String(error)));
      return fallback;
    }
  }

  function markMapSource(inspections, source, field, base) {
    var value = base && base[field];
    if (typeof value === 'string' && /^err:/i.test(value)) {
      inspections.push(inspection(source, 'missing', '', value));
    } else {
      inspections.push(inspection(source, 'complete', source + ' inspected'));
    }
  }

  function runMotionScoutProbe() {
    var base = {};
    var inspections = [];
    if (window.__cap && typeof window.__cap.map === 'function') {
      try {
        base = window.__cap.map() || {};
      } catch (error) {
        base = {};
        ['css-transition-hover', 'hover-affordance', 'css-keyframes-loop', 'split-reveal-dom', 'scroll-trigger-registry'].forEach(function (source) {
          inspections.push(inspection(source, 'missing', '', error && error.message ? error.message : String(error)));
        });
      }
    }
    if (base && Object.keys(base).length) {
      markMapSource(inspections, 'css-transition-hover', 'cssHovers', base);
      markMapSource(inspections, 'hover-affordance', 'hoverCandidates', base);
      markMapSource(inspections, 'css-keyframes-loop', 'loops', base);
      markMapSource(inspections, 'split-reveal-dom', 'splitReveals', base);
      markMapSource(inspections, 'scroll-trigger-registry', 'scrollTriggers', base);
    }
    return Object.assign({}, base, {
      clickCandidates: inspectSource(inspections, 'click-affordance', 'click affordance selectors inspected', function () {
        return selectorsFor('[onclick], button, [role="button"], [aria-expanded], details summary, [class*="accordion"], [class*="toggle"], [class*="modal"]', 60);
      }, []),
      cursorCandidates: inspectSource(inspections, 'cursor-affordance', 'cursor affordance selectors inspected', cursorCandidates, []),
      stickyCandidates: inspectSource(inspections, 'sticky-pinned-clue', 'sticky and pinned selectors inspected', stickyCandidates, []),
      cssKeyframes: inspectSource(inspections, 'css-keyframes', 'finite CSS keyframes inspected', cssKeyframes, []),
      sourceInspections: inspections
    });
  }

  window.__yoinkitMotionScoutProbe = runMotionScoutProbe;
}());
