'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  loadPageModel,
  loadRunConfig,
  mapReportDir,
  motionScoutDir,
  readJson,
  reconDir,
  staticMapDir,
  writeJson,
  writeText,
} = require('./artifacts');

const MAP_REPORT_SCHEMA_VERSION = 1;

class MapReportPrerequisiteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MapReportPrerequisiteError';
  }
}

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function runRelativePath(runDir, file) {
  return path.relative(runDir, file).split(path.sep).join('/');
}

function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrEscape(value) {
  return htmlEscape(value).replace(/`/g, '&#96;');
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requiredInputFiles(runDir) {
  return [
    path.join(reconDir(runDir), 'page-state.json'),
    path.join(staticMapDir(runDir), 'measurements.json'),
    path.join(staticMapDir(runDir), 'assertions.json'),
    path.join(staticMapDir(runDir), 'coverage.md'),
    path.join(motionScoutDir(runDir), 'motion-candidates.json'),
    path.join(motionScoutDir(runDir), 'assertions.json'),
    path.join(motionScoutDir(runDir), 'coverage.md'),
    path.join(runDir, 'page-model.json'),
  ];
}

function assertPrerequisites(runDir, pageModel) {
  const missing = requiredInputFiles(runDir).filter(file => !fs.existsSync(file));
  if (missing.length) {
    const labels = missing.map(file => runRelativePath(runDir, file)).join(', ');
    throw new MapReportPrerequisiteError(`map-report requires completed Recon, Static Map, and Motion Scout artifacts; missing ${labels}`);
  }

  const pageState = readJson(path.join(reconDir(runDir), 'page-state.json'));
  if (pageState.status && pageState.status !== 'ready') {
    throw new MapReportPrerequisiteError(`map-report requires ready Recon evidence; found ${pageState.status}`);
  }

  const regions = pageModel && pageModel.pages && pageModel.pages.home && Array.isArray(pageModel.pages.home.regions)
    ? pageModel.pages.home.regions
    : [];
  if (!regions.length) {
    throw new MapReportPrerequisiteError('map-report requires Static Map Region facts in page-model.json');
  }
}

function inputHashes(runDir) {
  const hashes = {};
  for (const file of requiredInputFiles(runDir)) {
    hashes[runRelativePath(runDir, file)] = sha256File(file);
  }
  return hashes;
}

function readInputs(runDir) {
  return {
    pageModel: loadPageModel(runDir),
    recon: {
      pageState: readJson(path.join(reconDir(runDir), 'page-state.json')),
    },
    staticMap: {
      measurements: readJson(path.join(staticMapDir(runDir), 'measurements.json')),
      assertions: readJson(path.join(staticMapDir(runDir), 'assertions.json')),
      coverageText: fs.readFileSync(path.join(staticMapDir(runDir), 'coverage.md'), 'utf8'),
    },
    motionScout: {
      candidates: readJson(path.join(motionScoutDir(runDir), 'motion-candidates.json')),
      assertions: readJson(path.join(motionScoutDir(runDir), 'assertions.json')),
      coverageText: fs.readFileSync(path.join(motionScoutDir(runDir), 'coverage.md'), 'utf8'),
    },
  };
}

function configuredViewports(config) {
  return Array.isArray(config.viewports) ? config.viewports.slice() : [];
}

function primaryViewport(config) {
  return config.primaryViewport || (config.viewports && config.viewports[0] && config.viewports[0].id) || 'desktop';
}

function pageRegions(pageModel) {
  const home = pageModel && pageModel.pages && pageModel.pages.home;
  return home && Array.isArray(home.regions) ? home.regions : [];
}

function pageDimensions(pageModel, viewportId, regions) {
  const home = pageModel && pageModel.pages && pageModel.pages.home;
  const measured = home && home.dimensions && home.dimensions[viewportId];
  if (measured && measured.scrollWidth && measured.scrollHeight) {
    return {
      width: Number(measured.scrollWidth),
      height: Number(measured.scrollHeight),
    };
  }
  let width = 0;
  let height = 0;
  for (const region of regions) {
    const facts = region.viewports && region.viewports[viewportId];
    if (!facts || facts.presence !== 'present' || !facts.rect) continue;
    const left = Number(facts.rect.x) || 0;
    const top = (Number(facts.scrollY) || 0) + (Number(facts.rect.y) || 0);
    width = Math.max(width, left + (Number(facts.rect.width) || 0));
    height = Math.max(height, top + (Number(facts.rect.height) || 0));
  }
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

function presentRegionFacts(region, viewportId) {
  const facts = region.viewports && region.viewports[viewportId];
  if (!facts || facts.presence !== 'present' || !facts.rect) return null;
  return facts;
}

function regionBoxStyle(facts) {
  const rect = facts.rect || {};
  const left = Math.round(Number(rect.x) || 0);
  const top = Math.round((Number(facts.scrollY) || 0) + (Number(rect.y) || 0));
  const width = Math.round(Number(rect.width) || 0);
  const height = Math.round(Number(rect.height) || 0);
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;
}

function evidenceHref(reportDir, runDir, evidencePath) {
  if (!evidencePath) return null;
  if (/^[a-z]+:/i.test(evidencePath) || evidencePath.startsWith('//')) return null;
  const target = path.resolve(runDir, evidencePath);
  const runRelative = path.relative(runDir, target);
  if (runRelative.startsWith(`..${path.sep}`) || runRelative === '..' || path.isAbsolute(runRelative)) return null;
  return path.relative(reportDir, target).split(path.sep).join('/');
}

function renderStaticFacts(region) {
  const typography = Array.isArray(region.static && region.static.typography) ? region.static.typography : [];
  const colors = Array.isArray(region.static && region.static.colors) ? region.static.colors : [];
  return `
    <dl class="static-facts">
      <div><dt>Typography</dt><dd>${htmlEscape(typography.slice(0, 3).map(item => [item.fontFamily, item.fontSize, item.fontWeight].filter(Boolean).join(' ')).filter(Boolean).join('; ') || 'none recorded')}</dd></div>
      <div><dt>Color</dt><dd>${htmlEscape(colors.slice(0, 3).map(item => item.value || item.color || item.property).filter(Boolean).join('; ') || 'none recorded')}</dd></div>
    </dl>`;
}

function renderAssetLinks(region, reportDir, runDir) {
  const assets = Array.isArray(region.static && region.static.assets) ? region.static.assets : [];
  if (!assets.length) return '';
  const items = assets.slice(0, 8).map((asset) => {
    const href = evidenceHref(reportDir, runDir, asset.path);
    const label = asset.path || asset.url || asset.selector || asset.kind || 'asset evidence';
    if (!href) return `<li>${htmlEscape(label)}</li>`;
    return `<li><a href="${attrEscape(href)}">${htmlEscape(label)}</a></li>`;
  }).join('');
  return `<ul class="asset-links">${items}</ul>`;
}

function renderCrop(region, facts, reportDir, runDir) {
  const cropPath = facts.crop && facts.crop.path;
  const href = evidenceHref(reportDir, runDir, cropPath);
  if (!href) {
    const reason = facts.crop && facts.crop.reason ? facts.crop.reason : 'crop unavailable';
    return `<div class="crop-missing">${htmlEscape(reason)}</div>`;
  }
  return `<img class="region-crop" src="${attrEscape(href)}" alt="${attrEscape(region.name || region.id)} crop">`;
}

function metadataTitle(region, facts, viewportId) {
  const rect = facts.rect || {};
  return [
    `Region: ${region.name || region.id}`,
    `id: ${region.id}`,
    `viewport: ${viewportId}`,
    `rect: ${Math.round(rect.x || 0)},${Math.round(rect.y || 0)} ${Math.round(rect.width || 0)}x${Math.round(rect.height || 0)}`,
    `scrollY: ${Math.round(facts.scrollY || 0)}`,
  ].join('\n');
}

function renderSourceMode({ pageModel, reportDir, runDir, viewportId }) {
  const regions = pageRegions(pageModel);
  const dimensions = pageDimensions(pageModel, viewportId, regions);
  const boxes = regions.map((region) => {
    const facts = presentRegionFacts(region, viewportId);
    if (!facts) return '';
    return `
      <article class="region-box source-box" data-region-id="${attrEscape(region.id)}" style="${attrEscape(regionBoxStyle(facts))}">
        ${renderCrop(region, facts, reportDir, runDir)}
        <div class="source-summary">
          <h3>${htmlEscape(region.name || region.id)}</h3>
          ${renderStaticFacts(region)}
          ${renderAssetLinks(region, reportDir, runDir)}
        </div>
      </article>`;
  }).join('');
  return `
    <section class="report-mode source-mode is-active" data-mode="source" aria-labelledby="source-mode-title">
      <div class="mode-heading">
        <h2 id="source-mode-title">Source</h2>
      </div>
      <div class="page-scaffold" style="width:${Math.round(dimensions.width)}px;height:${Math.round(dimensions.height)}px;">
        ${boxes}
      </div>
    </section>`;
}

function renderRegionMode({ pageModel, viewportId }) {
  const regions = pageRegions(pageModel);
  const dimensions = pageDimensions(pageModel, viewportId, regions);
  const boxes = regions.map((region) => {
    const facts = presentRegionFacts(region, viewportId);
    if (!facts) return '';
    return `
      <article class="region-box debug-box" data-region-id="${attrEscape(region.id)}" title="${attrEscape(metadataTitle(region, facts, viewportId))}" style="${attrEscape(regionBoxStyle(facts))}">
        <span class="region-label">${htmlEscape(region.name || region.id)}</span>
        <span class="region-meta">${htmlEscape(region.id)}</span>
      </article>`;
  }).join('');
  return `
    <section class="report-mode region-mode" data-mode="region" aria-labelledby="region-mode-title">
      <div class="mode-heading">
        <h2 id="region-mode-title">Region</h2>
      </div>
      <div class="page-scaffold debug-scaffold" style="width:${Math.round(dimensions.width)}px;height:${Math.round(dimensions.height)}px;">
        ${boxes}
      </div>
    </section>`;
}

function assertionFindings(source, assertions) {
  const rows = Array.isArray(assertions && assertions.assertions) ? assertions.assertions : [];
  return rows
    .filter(row => row.required !== false && row.status !== 'pass')
    .map(row => ({
      source,
      id: row.id,
      status: row.status || 'unknown',
      message: row.failure || (Array.isArray(row.evidence) ? row.evidence.join('; ') : 'required assertion did not pass'),
    }));
}

function regionUnknownFindings(pageModel) {
  return pageRegions(pageModel).flatMap(region => (
    Array.isArray(region.unknowns) ? region.unknowns : []
  ).map(unknown => ({
    source: 'page-model',
    id: `${region.id}:${unknown.field || 'unknown'}`,
    status: 'unknown',
    message: unknown.reason || 'unknown Region fact recorded',
  })));
}

function exceptionFindings(pageModel) {
  return (Array.isArray(pageModel.exceptions) ? pageModel.exceptions : [])
    .filter(exception => !(exception.approved === true || exception.approvedBy || exception.approvedAt))
    .map(exception => ({
      source: 'page-model',
      id: exception.id || 'unapproved-exception',
      status: 'exception',
      message: exception.reason || 'unapproved exception blocks Map Gate',
    }));
}

function motionCandidateFindings(motionCandidates) {
  const candidates = Array.isArray(motionCandidates && motionCandidates.candidates)
    ? motionCandidates.candidates
    : [];
  return candidates.map(candidate => ({
    source: 'motion-scout',
    id: candidate.id,
    status: 'candidate',
    message: `${candidate.trigger || 'unknown'} lead for ${candidate.targetSelector || 'unknown target'}`,
  }));
}

function parseMarkdownRow(line) {
  return String(line || '')
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function coverageFindings(source, coverageText) {
  const findings = [];
  let header = null;
  let statusIndex = -1;
  let idIndex = 0;

  for (const rawLine of String(coverageText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      header = null;
      statusIndex = -1;
      idIndex = 0;
      continue;
    }
    if (/^\|\s*:?-+/.test(line)) continue;

    const cells = parseMarkdownRow(line);
    if (!header) {
      header = cells;
      statusIndex = header.findIndex(cell => /^status$/i.test(cell));
      idIndex = header.findIndex(cell => /^(name|assertion|candidate)$/i.test(cell));
      if (idIndex < 0) idIndex = 0;
      continue;
    }

    if (statusIndex < 0) continue;
    const status = cells[statusIndex];
    if (!/^missing$/i.test(status)) continue;
    findings.push({
      source,
      id: cells[idIndex] || cells[0] || `${source}-coverage`,
      status: status.toLowerCase(),
      message: cells.join(' · '),
    });
  }

  return findings;
}

function timestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function staleFinding({ source, file, upstreamFile, generatedAt, upstreamGeneratedAt }) {
  const current = timestamp(generatedAt);
  const upstream = timestamp(upstreamGeneratedAt);
  if (current == null || upstream == null || current >= upstream) return null;
  return {
    source,
    id: file,
    status: 'stale',
    message: `${file} is older than ${upstreamFile}`,
  };
}

function freshnessFindings(snapshot) {
  return [
    staleFinding({
      source: 'static-map',
      file: '02-static-map/assertions.json',
      upstreamFile: '01-recon/page-state.json',
      generatedAt: snapshot.staticMap.assertions && snapshot.staticMap.assertions.generatedAt,
      upstreamGeneratedAt: snapshot.recon.pageState && snapshot.recon.pageState.generatedAt,
    }),
    staleFinding({
      source: 'motion-scout',
      file: '03-motion-scout/assertions.json',
      upstreamFile: '02-static-map/assertions.json',
      generatedAt: snapshot.motionScout.assertions && snapshot.motionScout.assertions.generatedAt,
      upstreamGeneratedAt: snapshot.staticMap.assertions && snapshot.staticMap.assertions.generatedAt,
    }),
  ].filter(Boolean);
}

function buildGateFindings(snapshot) {
  const staticAssertionFindings = assertionFindings('static-map', snapshot.staticMap.assertions);
  const motionAssertionFindings = assertionFindings('motion-scout', snapshot.motionScout.assertions);
  const assertionIds = new Set(staticAssertionFindings.concat(motionAssertionFindings).map(finding => finding.id));
  const coverage = coverageFindings('static-map-coverage', snapshot.staticMap.coverageText)
    .concat(coverageFindings('motion-scout-coverage', snapshot.motionScout.coverageText))
    .filter(finding => !assertionIds.has(finding.id));

  return []
    .concat(staticAssertionFindings)
    .concat(motionAssertionFindings)
    .concat(coverage)
    .concat(regionUnknownFindings(snapshot.pageModel))
    .concat(exceptionFindings(snapshot.pageModel))
    .concat(freshnessFindings(snapshot))
    .concat(motionCandidateFindings(snapshot.motionScout.candidates));
}

function renderFinding(finding) {
  return `
    <li class="finding finding-${attrEscape(finding.status)}">
      <strong>${htmlEscape(finding.status)}</strong>
      <span>${htmlEscape(finding.source)} · ${htmlEscape(finding.id)}</span>
      <p>${htmlEscape(finding.message)}</p>
    </li>`;
}

function renderFreshnessRows(inputHashes) {
  return Object.entries(inputHashes).map(([file, hash]) => `
    <li class="freshness-row">
      <strong>hash</strong>
      <span>${htmlEscape(file)}</span>
      <code>${htmlEscape(hash.slice(0, 16))}</code>
    </li>`).join('');
}

function renderGateMode({ snapshot }) {
  const findings = Array.isArray(snapshot.gateFindings) ? snapshot.gateFindings : buildGateFindings(snapshot);
  const findingList = findings.length
    ? findings.map(renderFinding).join('')
    : '<li class="finding finding-pass"><strong>pass</strong><span>No Map Gate blockers found in current Report inputs.</span></li>';
  return `
    <section class="report-mode gate-mode" data-mode="gate" aria-labelledby="gate-mode-title">
      <div class="mode-heading">
        <h2 id="gate-mode-title">Gate</h2>
      </div>
      <div class="gate-grid">
        <section>
          <h3>Findings</h3>
          <ul class="findings">${findingList}</ul>
        </section>
        <section>
          <h3>Input Freshness</h3>
          <ul class="freshness">${renderFreshnessRows(snapshot.inputHashes)}</ul>
        </section>
      </div>
    </section>`;
}

function renderStyles() {
  return `<style>
    :root { color-scheme: light; --ink:#191919; --muted:#666; --line:#d8d8d8; --paper:#fbfbf8; --accent:#0a6f68; --warn:#9b3a22; --info:#315a9a; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #f2f2ee; }
    header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 20px; border-bottom: 1px solid var(--line); background: rgba(251,251,248,.96); }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 18px; font-weight: 700; }
    h2 { font-size: 16px; font-weight: 700; }
    h3 { font-size: 13px; font-weight: 700; }
    nav { display: flex; gap: 8px; }
    nav button { color: var(--ink); border: 1px solid var(--line); padding: 6px 10px; border-radius: 6px; background: white; font: inherit; font-size: 13px; cursor: pointer; }
    nav button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
    main { display: grid; gap: 28px; padding: 20px; }
    .mode-heading { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
    .report-mode { overflow: auto; border-top: 1px solid var(--line); padding-top: 18px; }
    .report-mode[hidden] { display: none; }
    .page-scaffold { position: relative; min-width: 320px; background: white; border: 1px solid var(--line); box-shadow: 0 1px 8px rgba(0,0,0,.05); }
    .region-box { position: absolute; overflow: hidden; border: 1px solid rgba(0,0,0,.16); background: #fff; }
    .source-box { display: grid; grid-template-rows: minmax(0,1fr) auto; }
    .region-crop { display: block; width: 100%; height: 100%; min-height: 0; object-fit: cover; }
    .crop-missing { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); background: repeating-linear-gradient(-45deg,#fafafa,#fafafa 8px,#f0f0f0 8px,#f0f0f0 16px); font-size: 12px; padding: 12px; text-align: center; }
    .source-summary { position: absolute; left: 8px; right: 8px; bottom: 8px; display: grid; gap: 5px; padding: 8px; background: rgba(255,255,255,.92); border: 1px solid rgba(0,0,0,.12); border-radius: 6px; }
    .static-facts { display: grid; gap: 3px; margin: 0; font-size: 11px; color: var(--muted); }
    .static-facts div { display: grid; grid-template-columns: 76px 1fr; gap: 6px; }
    .static-facts dt { font-weight: 700; color: var(--ink); }
    .static-facts dd { margin: 0; }
    .asset-links { margin: 0; padding-left: 16px; font-size: 11px; }
    .debug-box { background: rgba(10,111,104,.12); border: 1px solid rgba(10,111,104,.75); outline: 9999px solid rgba(10,111,104,.015); }
    .debug-box:hover { background: rgba(10,111,104,.2); border-color: var(--accent); }
    .region-label, .region-meta { position: absolute; left: 8px; max-width: calc(100% - 16px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; border-radius: 4px; padding: 3px 6px; background: rgba(255,255,255,.94); font-size: 12px; }
    .region-label { top: 8px; font-weight: 700; }
    .region-meta { bottom: 8px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .gate-grid { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(280px,.7fr); gap: 18px; align-items: start; }
    .findings, .freshness { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .finding, .freshness-row { display: grid; gap: 4px; padding: 10px; border: 1px solid var(--line); background: white; border-radius: 6px; }
    .finding strong, .freshness-row strong { width: fit-content; border-radius: 4px; padding: 2px 6px; background: #e7eee9; color: var(--accent); font-size: 11px; text-transform: uppercase; }
    .finding-fail strong, .finding-exception strong, .finding-unknown strong, .finding-incomplete strong, .finding-missing strong, .finding-stale strong { background: #f5e4de; color: var(--warn); }
    .finding-candidate strong { background: #e3ebf8; color: var(--info); }
    .finding span, .freshness-row span { color: var(--muted); font-size: 12px; }
    .finding p { font-size: 13px; line-height: 1.35; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    @media (max-width: 780px) { header { align-items: flex-start; flex-direction: column; } .gate-grid { grid-template-columns: 1fr; } main { padding: 14px; } }
  </style>`;
}

function renderModeScript() {
  return `<script>
    (function () {
      var modes = Array.prototype.slice.call(document.querySelectorAll('[data-mode]'));
      var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-report-mode-toggle]'));
      function setMode(mode) {
        var selected = modes.some(function (section) { return section.getAttribute('data-mode') === mode; }) ? mode : 'source';
        document.documentElement.dataset.reportMode = selected;
        modes.forEach(function (section) {
          var active = section.getAttribute('data-mode') === selected;
          section.hidden = !active;
          section.classList.toggle('is-active', active);
        });
        toggles.forEach(function (button) {
          button.setAttribute('aria-pressed', button.getAttribute('data-report-mode-toggle') === selected ? 'true' : 'false');
        });
      }
      toggles.forEach(function (button) {
        button.addEventListener('click', function () {
          setMode(button.getAttribute('data-report-mode-toggle'));
        });
      });
      window.__yoinkitReportSetMode = setMode;
      setMode((location.hash || '').replace(/^#/, '') || 'source');
    })();
  </script>`;
}

function renderHtml({ config, snapshot, reportDir, runDir }) {
  const viewportId = primaryViewport(config);
  const title = `${config.slug || 'YoinkIt'} Map Report`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  ${renderStyles()}
</head>
<body>
  <header>
    <div>
      <h1>${htmlEscape(title)}</h1>
      <p>${htmlEscape(config.targetUrl || snapshot.pageModel.source && snapshot.pageModel.source.url || '')}</p>
    </div>
    <nav aria-label="Report modes">
      <button type="button" data-report-mode-toggle="source" aria-pressed="true">Source</button>
      <button type="button" data-report-mode-toggle="region" aria-pressed="false">Region</button>
      <button type="button" data-report-mode-toggle="gate" aria-pressed="false">Gate</button>
    </nav>
  </header>
  <main>
    ${renderSourceMode({ pageModel: snapshot.pageModel, reportDir, runDir, viewportId })}
    ${renderRegionMode({ pageModel: snapshot.pageModel, viewportId })}
    ${renderGateMode({ snapshot })}
  </main>
  <script type="application/json" id="yoinkit-report-snapshot">${jsonForHtml(snapshot)}</script>
  ${renderModeScript()}
</body>
</html>
`;
}

function buildSnapshot({ config, generatedAt, inputs, hashes }) {
  const snapshot = {
    schemaVersion: MAP_REPORT_SCHEMA_VERSION,
    generatedAt,
    targetUrl: config.targetUrl,
    primaryViewport: primaryViewport(config),
    viewports: configuredViewports(config),
    inputHashes: hashes,
    pageModel: inputs.pageModel,
    recon: inputs.recon,
    staticMap: inputs.staticMap,
    motionScout: inputs.motionScout,
  };
  snapshot.gateFindings = buildGateFindings(snapshot);
  return snapshot;
}

function runMapReport(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const config = loadRunConfig(absRunDir);
  const pageModel = loadPageModel(absRunDir);
  assertPrerequisites(absRunDir, pageModel);

  const generatedAt = nowIso(env);
  const inputs = readInputs(absRunDir);
  const hashes = inputHashes(absRunDir);
  const snapshot = buildSnapshot({ config, generatedAt, inputs, hashes });
  const dir = mapReportDir(absRunDir);
  const reportFile = path.join(dir, 'index.html');
  const snapshotFile = path.join(dir, 'report-snapshot.json');
  const html = renderHtml({ config, snapshot, reportDir: dir, runDir: absRunDir });

  writeJson(snapshotFile, snapshot);
  writeText(reportFile, html);

  return {
    status: 'ready',
    generatedAt,
    artifacts: {
      report: reportFile,
      snapshot: snapshotFile,
    },
    snapshot,
    html,
  };
}

module.exports = {
  MAP_REPORT_SCHEMA_VERSION,
  MapReportPrerequisiteError,
  runMapReport,
};
