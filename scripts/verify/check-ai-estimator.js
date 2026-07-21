#!/usr/bin/env node
/**
 * Regression test for utils/aiEstimator.ts (the AI Trash Estimator client).
 *
 * The Groq/NVIDIA/Claude provider chain itself no longer lives here — it
 * moved server-side into the `ai-trash-estimate` Supabase edge function so
 * the provider API keys stop shipping inside the compiled app. This script
 * now verifies the client-side half of that contract:
 *   1. analyzeTrashImage() calls supabase.functions.invoke('ai-trash-estimate', ...)
 *      with the image, not any provider directly.
 *   2. A successful proxy response passes straight through.
 *   3. Any proxy failure (network error, quota 429, malformed body) falls
 *      back to the same hardcoded smart-mock estimate the old all-providers-
 *      failed path used, so a proxy outage never blocks a user's booking.
 *   4. No provider API key env vars or direct provider fetch() calls have
 *      been reintroduced into this file — the whole point of this change.
 *
 * Transpiles the real source file (same technique as check-syntax.js) and
 * runs it against a mocked '../lib/supabase' module, so this exercises the
 * actual client code — not a reimplementation of it.
 *
 * Usage: node scripts/verify/check-ai-estimator.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('typescript');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(REPO_ROOT, 'utils', 'aiEstimator.ts');

let hasError = false;
function fail(msg) {
  hasError = true;
  console.error(`[check-ai-estimator] FAIL: ${msg}`);
}
function pass(msg) {
  console.log(`[check-ai-estimator] PASS: ${msg}`);
}

const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Regression guard: none of the removed client-side provider keys or a bare
// fetch() call should ever reappear in this file — that would mean a
// provider key is shipping in the client app again.
const forbiddenPatterns = [
  'EXPO_PUBLIC_NVIDIA_API_KEY',
  'EXPO_PUBLIC_GROQ_API_KEY',
  'EXPO_PUBLIC_ANTHROPIC_API_KEY',
  'EXPO_PUBLIC_GEMINI_API_KEY',
];
const foundForbidden = forbiddenPatterns.filter((p) => source.includes(p));
if (foundForbidden.length > 0) {
  fail(`found client-side provider key reference(s), should be server-side only: ${foundForbidden.join(', ')}`);
} else {
  pass('no provider API key env vars referenced client-side');
}
if (/[^.\w]fetch\(/.test(source)) {
  fail('found a direct fetch(...) call — provider requests must go through the ai-trash-estimate edge function, not straight from the client');
} else {
  pass('no direct fetch() calls to AI providers from the client');
}
if (!source.includes("functions.invoke('ai-trash-estimate'")) {
  fail("analyzeTrashImage does not call supabase.functions.invoke('ai-trash-estimate', ...)");
} else {
  pass("calls supabase.functions.invoke('ai-trash-estimate', ...)");
}

// Build a temp dir that mirrors the real repo's relative layout
// (tmpRoot/utils/aiEstimator.js importing '../lib/supabase') so the
// compiled file's own `require('../lib/supabase')` resolves to our mock
// without needing a module-loader hook.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-estimator-test-'));
const utilsDir = path.join(tmpRoot, 'utils');
const libDir = path.join(tmpRoot, 'lib');
fs.mkdirSync(utilsDir, { recursive: true });
fs.mkdirSync(libDir, { recursive: true });

const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const compiledPath = path.join(utilsDir, 'aiEstimator.js');
fs.writeFileSync(compiledPath, outputText);

let invokeImpl = async () => ({ data: null, error: new Error('not mocked') });
let lastInvokeCall = null;
fs.writeFileSync(
  path.join(libDir, 'supabase.js'),
  `
exports.supabase = {
  functions: {
    invoke: (name, opts) => {
      global.__lastInvokeCall = { name, opts };
      return global.__invokeImpl(name, opts);
    },
  },
};
`
);
global.__invokeImpl = (...args) => invokeImpl(...args);

function freshModule() {
  delete require.cache[require.resolve(compiledPath)];
  return require(compiledPath);
}

async function testSuccessPathPassesThrough() {
  const fakeEstimate = {
    trashType: 'Household Mixed Waste',
    binCount: 2,
    weightKg: 100,
    price: 80,
    confidence: 88,
    recommendedVehicle: 'Pickup',
    reasoning: 'test',
    provider: 'nvidia',
  };
  invokeImpl = async () => ({ data: fakeEstimate, error: null });

  const mod = freshModule();
  const estimate = await mod.analyzeTrashImage('ZmFrZS1iYXNlNjQtaW1hZ2U=');

  const call = global.__lastInvokeCall;
  if (!call || call.name !== 'ai-trash-estimate') {
    fail(`expected invoke('ai-trash-estimate', ...), got ${JSON.stringify(call && call.name)}`);
  } else {
    pass("invokes the 'ai-trash-estimate' edge function");
  }
  if (!call || call.opts?.body?.image !== 'ZmFrZS1iYXNlNjQtaW1hZ2U=') {
    fail(`expected request body { image }, got ${JSON.stringify(call && call.opts)}`);
  } else {
    pass('sends the base64 image in the request body');
  }
  if (JSON.stringify(estimate) !== JSON.stringify(fakeEstimate)) {
    fail(`expected a successful proxy response to pass through unchanged, got ${JSON.stringify(estimate)}`);
  } else {
    pass('a successful proxy response passes straight through');
  }
}

async function testErrorFallsBackToMock() {
  invokeImpl = async () => ({ data: null, error: new Error('quota exceeded') });

  const mod = freshModule();
  const estimate = await mod.analyzeTrashImage('ZmFrZS1iYXNlNjQtaW1hZ2U=');

  if (estimate.provider !== undefined || estimate.trashType !== 'Mixed Household Waste (Estimated)') {
    fail(`expected smart-mock fallback on proxy error, got ${JSON.stringify(estimate)}`);
  } else {
    pass('falls back to the smart-mock estimate when the proxy errors (e.g. quota/network failure)');
  }
  if (estimate.price !== 60) {
    fail(`expected mock fallback price = 1.5 * STANDARD_BIN_PRICE_GHS(40) = 60, got ${estimate.price}`);
  } else {
    pass('mock fallback price uses STANDARD_BIN_PRICE_GHS correctly');
  }
}

async function testMalformedResponseFallsBackToMock() {
  invokeImpl = async () => ({ data: { unexpected: 'shape' }, error: null });

  const mod = freshModule();
  const estimate = await mod.analyzeTrashImage('ZmFrZS1iYXNlNjQtaW1hZ2U=');

  if (estimate.provider !== undefined || estimate.trashType !== 'Mixed Household Waste (Estimated)') {
    fail(`expected smart-mock fallback on malformed proxy response, got ${JSON.stringify(estimate)}`);
  } else {
    pass('falls back to the smart-mock estimate when the proxy returns a malformed body');
  }
}

testSuccessPathPassesThrough()
  .then(testErrorFallsBackToMock)
  .then(testMalformedResponseFallsBackToMock)
  .catch((e) => {
    fail(`unexpected exception: ${e.stack || e}`);
  })
  .finally(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(hasError ? 1 : 0);
  });
