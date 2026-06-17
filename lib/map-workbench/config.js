'use strict';

const path = require('path');

const CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_MODE = 'observe';
const DEFAULT_VIEWPORT = { id: 'desktop', width: 1280, height: 800 };
const DEFAULT_ASSET_MAX_BYTES = 10_000_000;
const VALID_MODES = new Set(['observe', 'automated']);

function usageText() {
  return `yoinkit init <url> [--run-dir DIR] [--slug NAME] [--viewport WIDTHxHEIGHT] [--viewport ID=WIDTHxHEIGHT] [--primary-viewport ID] [--output-dir DIR] [--mode observe|automated] [--allow-file-assets --file-asset-root DIR] [--fetch-public-cross-origin-assets] [--strict-skipped-assets]`;
}

function fail(message) {
  const error = new Error(message);
  error.userFacing = true;
  throw error;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`);
  return value;
}

function parseInitArgs(argv) {
  const options = { viewports: [] };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--run-dir') {
      options.runDir = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--slug') {
      options.slug = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--viewport') {
      options.viewports.push(requireValue(argv, i, arg));
      i += 1;
    } else if (arg === '--primary-viewport') {
      options.primaryViewport = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--output-dir') {
      options.outputDir = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--mode') {
      options.mode = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--allow-file-assets') {
      options.allowFileAssets = true;
    } else if (arg === '--file-asset-root') {
      options.fileAssetRoot = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--fetch-public-cross-origin-assets') {
      options.fetchPublicCrossOriginAssets = true;
    } else if (arg === '--strict-skipped-assets') {
      options.strictSkippedAssets = true;
    } else if (arg.startsWith('--')) {
      fail(`Unknown init option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (!options.help && positionals.length !== 1) {
    fail(positionals.length ? 'init accepts exactly one source URL' : 'init requires a source URL');
  }

  options.url = positionals[0] || null;
  return options;
}

function parseUrl(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) fail(`Unsupported URL protocol: ${parsed.protocol}`);
    return parsed;
  } catch (error) {
    if (error.userFacing) throw error;
    fail(`Invalid source URL: ${value}`);
  }
}

function slugify(value, fallback = 'run') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function hostSlug(parsedUrl) {
  const host = String(parsedUrl.host || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return host || 'site';
}

function defaultSlugForUrl(parsedUrl) {
  const pathname = decodeURIComponent(parsedUrl.pathname || '/');
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  return slugify(trimmed || 'home', 'home');
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function deterministicRunDir(parsedUrl, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const date = ymd(options.now || new Date());
  const slug = slugify(options.slug || defaultSlugForUrl(parsedUrl), 'run');
  return path.join(cwd, 'yoink-runs', hostSlug(parsedUrl), `${date}-${slug}`);
}

function parseViewportShorthand(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:(?<id>[A-Za-z0-9][A-Za-z0-9._-]*)=)?(?<width>\d+)x(?<height>\d+)$/);
  if (!match) fail(`Invalid viewport "${value}". Use WIDTHxHEIGHT or id=WIDTHxHEIGHT.`);
  const width = Number(match.groups.width);
  const height = Number(match.groups.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`Invalid viewport "${value}". Width and height must be positive integers.`);
  }
  return {
    requestedId: match.groups.id ? slugify(match.groups.id, '') : null,
    width,
    height,
  };
}

function inferredViewportId(width) {
  if (width >= 900) return 'desktop';
  if (width >= 600) return 'tablet';
  return 'mobile';
}

function uniqueViewportId(base, used) {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function resolveViewports(values = []) {
  const specs = values.length ? values.map(parseViewportShorthand) : [DEFAULT_VIEWPORT];
  const used = new Set();
  return specs.map((spec) => {
    const base = spec.id || spec.requestedId || inferredViewportId(spec.width);
    return {
      id: uniqueViewportId(base, used),
      width: spec.width,
      height: spec.height,
    };
  });
}

function normalizePrimaryViewport(primaryViewport, viewports) {
  if (!primaryViewport) return viewports[0].id;
  const id = slugify(primaryViewport, '');
  if (!viewports.some((viewport) => viewport.id === id)) {
    fail(`Primary viewport "${primaryViewport}" does not reference a configured viewport.`);
  }
  return id;
}

function resolvePath(value, cwd) {
  return path.resolve(cwd, value);
}

function defaultAssetPolicy() {
  return {
    file: {
      mode: 'skip',
      root: null,
    },
    crossOrigin: {
      mode: 'skip',
    },
    strictSkippedAssets: false,
    maxBytes: DEFAULT_ASSET_MAX_BYTES,
  };
}

function assetPolicyFromOptions(options = {}, cwd = process.cwd(), basePolicy = defaultAssetPolicy()) {
  const assets = JSON.parse(JSON.stringify(basePolicy || defaultAssetPolicy()));
  if (options.allowFileAssets !== undefined || options.fileAssetRoot !== undefined) {
    if (!options.allowFileAssets) fail('--file-asset-root requires --allow-file-assets');
    if (!options.fileAssetRoot) fail('--allow-file-assets requires --file-asset-root');
    assets.file = {
      mode: 'allow',
      root: resolvePath(options.fileAssetRoot, cwd),
    };
  }
  if (options.fetchPublicCrossOriginAssets !== undefined) {
    assets.crossOrigin = {
      mode: options.fetchPublicCrossOriginAssets ? 'fetch-public-https' : 'skip',
    };
  }
  if (options.strictSkippedAssets !== undefined) {
    assets.strictSkippedAssets = Boolean(options.strictSkippedAssets);
  }
  assets.maxBytes = Number(assets.maxBytes) > 0 ? Number(assets.maxBytes) : DEFAULT_ASSET_MAX_BYTES;
  return assets;
}

function normalizeAssetPolicy(policy = {}) {
  const defaults = defaultAssetPolicy();
  const next = {
    file: Object.assign({}, defaults.file, policy.file || {}),
    crossOrigin: Object.assign({}, defaults.crossOrigin, policy.crossOrigin || {}),
    strictSkippedAssets: Boolean(policy.strictSkippedAssets),
    maxBytes: Number(policy.maxBytes) > 0 ? Number(policy.maxBytes) : DEFAULT_ASSET_MAX_BYTES,
  };
  if (next.file.mode !== 'allow') next.file.root = null;
  return next;
}

function applyAssetPolicyOptions(config, options = {}, env = {}) {
  const cwd = path.resolve(env.cwd || process.cwd());
  const next = JSON.parse(JSON.stringify(config));
  next.yoink = next.yoink && typeof next.yoink === 'object' ? next.yoink : {};
  next.yoink.assets = assetPolicyFromOptions(options, cwd, normalizeAssetPolicy(next.yoink.assets));
  return next;
}

function resolveRunConfig(options = {}, env = {}) {
  const cwd = path.resolve(env.cwd || process.cwd());
  const parsedUrl = parseUrl(options.url);
  const viewports = resolveViewports(options.viewports || []);
  const primaryViewport = normalizePrimaryViewport(options.primaryViewport, viewports);
  const mode = options.mode || DEFAULT_MODE;
  if (!VALID_MODES.has(mode)) fail(`Invalid mode "${mode}". Use observe or automated.`);

  const slug = slugify(options.slug || defaultSlugForUrl(parsedUrl), 'run');
  const runDir = options.runDir
    ? resolvePath(options.runDir, cwd)
    : deterministicRunDir(parsedUrl, { cwd, now: env.now, slug });
  const outputDir = options.outputDir
    ? resolvePath(options.outputDir, cwd)
    : path.join(runDir, 'out');

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    runDir,
    targetUrl: parsedUrl.href,
    scope: 'page',
    slug,
    viewports,
    primaryViewport,
    outputDir,
    yoink: {
      mode,
      assets: assetPolicyFromOptions(options, cwd),
    },
    implement: {
      targetStack: 'house',
      projectPath: outputDir,
      checkIns: true,
    },
  };
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_MODE,
  DEFAULT_VIEWPORT,
  DEFAULT_ASSET_MAX_BYTES,
  VALID_MODES,
  usageText,
  parseInitArgs,
  parseViewportShorthand,
  resolveViewports,
  normalizePrimaryViewport,
  resolveRunConfig,
  defaultAssetPolicy,
  normalizeAssetPolicy,
  applyAssetPolicyOptions,
  deterministicRunDir,
  defaultSlugForUrl,
  slugify,
};
