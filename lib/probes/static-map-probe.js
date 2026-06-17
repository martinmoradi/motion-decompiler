(function () {
  'use strict';

  function short(value, limit) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit || 180);
  }

  function absUrl(value) {
    try {
      return value ? new URL(value, document.URL).href : null;
    } catch (error) {
      return value || null;
    }
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    var tag = el.tagName.toLowerCase();
    var classes = Array.prototype.slice.call(el.classList || [])
      .filter(Boolean)
      .slice(0, 3)
      .map(function (cls) { return '.' + CSS.escape(cls); })
      .join('');
    if (classes) return tag + classes;
    var parent = el.parentElement;
    if (!parent) return tag;
    var siblings = Array.prototype.filter.call(parent.children, function (child) {
      return child.tagName === el.tagName;
    });
    if (siblings.length <= 1) return tag;
    return tag + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
  }

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity || 1) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function rectOf(el) {
    var rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function firstHeading(el) {
    var heading = el.querySelector('h1,h2,h3,[role="heading"]');
    return heading ? short(heading.textContent, 80) : null;
  }

  function repeatedItemCount(el) {
    var children = Array.prototype.filter.call(el.children || [], visible);
    if (children.length < 2) return 0;
    var counts = {};
    children.forEach(function (child) {
      var key = child.tagName.toLowerCase() + ':' + Array.prototype.slice.call(child.classList || []).sort().join('.');
      counts[key] = (counts[key] || 0) + 1;
    });
    return Math.max.apply(Math, Object.keys(counts).map(function (key) { return counts[key]; }));
  }

  function colorsFor(el) {
    var cs = getComputedStyle(el);
    var values = [
      { property: 'color', value: cs.color },
      { property: 'background-color', value: cs.backgroundColor },
      { property: 'border-color', value: cs.borderTopColor }
    ];
    return values
      .filter(function (entry) { return entry.value && entry.value !== 'rgba(0, 0, 0, 0)' && entry.value !== 'transparent'; })
      .map(function (entry) {
        return {
          property: entry.property,
          value: entry.value,
          evidence: selectorFor(el)
        };
      });
  }

  function unique(values) {
    var seen = {};
    return values.filter(function (value) {
      var text = String(value || '').trim();
      if (!text || seen[text]) return false;
      seen[text] = true;
      return true;
    });
  }

  function urlsFromCss(value) {
    var urls = [];
    String(value || '').replace(/url\(["']?([^"')]+)["']?\)/g, function (_, url) {
      urls.push(absUrl(url));
      return _;
    });
    return urls;
  }

  function typographySourceHints(fontFamily) {
    var hints = {
      stylesheetHrefs: [],
      fontUrls: []
    };
    var familyNeedle = String(fontFamily || '').toLowerCase();
    Array.prototype.slice.call(document.styleSheets || []).forEach(function (sheet) {
      if (sheet.href) hints.stylesheetHrefs.push(absUrl(sheet.href));
      var rules;
      try { rules = sheet.cssRules; } catch (error) { return; }
      if (!rules) return;
      Array.prototype.slice.call(rules).forEach(function (rule) {
        if (rule.type !== CSSRule.FONT_FACE_RULE || !rule.style) return;
        var family = String(rule.style.getPropertyValue('font-family') || '').replace(/["']/g, '').toLowerCase();
        if (family && familyNeedle && familyNeedle.indexOf(family) === -1) return;
        hints.fontUrls = hints.fontUrls.concat(urlsFromCss(rule.style.getPropertyValue('src')));
      });
    });
    hints.stylesheetHrefs = unique(hints.stylesheetHrefs).slice(0, 20);
    hints.fontUrls = unique(hints.fontUrls).slice(0, 20);
    return hints;
  }

  function typographyFor(el) {
    var target = el.querySelector('h1,h2,h3,p,a,button') || el;
    var cs = getComputedStyle(target);
    return [{
      selector: selectorFor(target),
      sampleText: short(target.textContent, 120),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      sourceHints: typographySourceHints(cs.fontFamily)
    }];
  }

  function assetsFor(el) {
    return Array.prototype.slice.call(el.querySelectorAll('img,video,source,[style*="background-image"]')).slice(0, 20).map(function (asset) {
      var cs = getComputedStyle(asset);
      var background = cs.backgroundImage && cs.backgroundImage !== 'none'
        ? cs.backgroundImage.replace(/^url\(["']?|["']?\)$/g, '')
        : null;
      return {
        selector: selectorFor(asset),
        kind: asset.tagName.toLowerCase(),
        url: absUrl(asset.currentSrc || asset.src || asset.getAttribute('src') || asset.getAttribute('srcset') || background),
        role: asset.getAttribute('aria-hidden') === 'true' || asset.getAttribute('alt') === '' ? 'decorative' : 'content',
        intrinsic: {
          width: asset.naturalWidth || asset.videoWidth || null,
          height: asset.naturalHeight || asset.videoHeight || null
        },
        rect: rectOf(asset)
      };
    });
  }

  function candidateFor(el) {
    var selector = selectorFor(el);
    var cs = getComputedStyle(el);
    return {
      selector: selector,
      selectors: [selector].filter(Boolean),
      semantic: {
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        heading: firstHeading(el),
        text: short(el.textContent, 120),
        repeatedItemCount: repeatedItemCount(el)
      },
      rect: rectOf(el),
      scrollY: Math.round(window.scrollY || 0),
      stacking: {
        zIndex: cs.zIndex || 'auto',
        position: cs.position || 'static'
      },
      colors: colorsFor(el),
      typography: typographyFor(el),
      assets: assetsFor(el),
      evidence: [{ method: 'static-map-probe', selector: selector }]
    };
  }

  function runStaticMapProbe() {
    window.scrollTo(0, 0);
    var selector = [
      'header',
      'nav',
      'main',
      'main > section',
      'section',
      'article',
      'footer',
      '[role="banner"]',
      '[role="navigation"]',
      '[role="main"]',
      '[role="contentinfo"]'
    ].join(',');
    var seen = new Set();
    var candidates = Array.prototype.slice.call(document.querySelectorAll(selector))
      .filter(visible)
      .filter(function (el) {
        if (seen.has(el)) return false;
        seen.add(el);
        var rect = el.getBoundingClientRect();
        return rect.width >= 24 && rect.height >= 24;
      })
      .map(candidateFor)
      .sort(function (a, b) { return a.rect.y - b.rect.y; });

    return {
      settling: {
        recipe: ['scroll-to-top', 'measure-resting-dom'],
        note: 'Static Map v0 probe measured resting layout after scrolling to top'
      },
      candidates: candidates
    };
  }

  window.__yoinkitStaticMapProbe = runStaticMapProbe;
}());
