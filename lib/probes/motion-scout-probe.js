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

  var MAP_SOURCE_FIELDS = [
    ['css-transition-hover', 'cssHovers'],
    ['hover-affordance', 'hoverCandidates'],
    ['css-keyframes-loop', 'loops'],
    ['split-reveal-dom', 'splitReveals'],
    ['scroll-trigger-registry', 'scrollTriggers']
  ];

  function inspection(source, status, evidence, reason, candidates) {
    return {
      source: source,
      status: status,
      attempted: true,
      completed: status === 'complete',
      candidates: candidates || 0,
      evidence: evidence || '',
      reason: reason || null
    };
  }

  function inspectSource(inspections, source, evidence, fn, fallback) {
    try {
      var value = fn();
      inspections.push(inspection(source, 'complete', evidence, null, Array.isArray(value) ? value.length : 0));
      return value;
    } catch (error) {
      inspections.push(inspection(source, 'missing', '', error && error.message ? error.message : String(error)));
      return fallback;
    }
  }

  function markMapSource(inspections, source, field, base) {
    if (!base || !Object.prototype.hasOwnProperty.call(base, field)) {
      inspections.push(inspection(source, 'missing', '', source + ' was not inspected'));
      return;
    }
    var value = base[field];
    if (typeof value === 'string' && /^err:/i.test(value)) {
      inspections.push(inspection(source, 'missing', '', value));
      return;
    }
    if (!Array.isArray(value)) {
      inspections.push(inspection(source, 'missing', '', field + ' did not return an array'));
      return;
    }
    inspections.push(inspection(source, 'complete', source + ' inspected', null, value.length));
  }

  function runMotionScoutProbe() {
    var base = {};
    var inspections = [];
    var mapError = null;
    if (window.__cap && typeof window.__cap.map === 'function') {
      try {
        base = window.__cap.map() || {};
      } catch (error) {
        base = {};
        mapError = error && error.message ? error.message : String(error);
      }
    } else {
      mapError = 'window.__cap.map is unavailable';
    }
    MAP_SOURCE_FIELDS.forEach(function (entry) {
      if (mapError) {
        inspections.push(inspection(entry[0], 'missing', '', mapError));
      } else {
        markMapSource(inspections, entry[0], entry[1], base);
      }
    });
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
