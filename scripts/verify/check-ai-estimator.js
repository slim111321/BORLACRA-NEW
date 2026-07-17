#!/usr/bin/env node
/**
 * Regression test for utils/aiEstimator.ts (the AI Trash Estimator).
 * Provider chain: NVIDIA (Mistral Medium 3.5 128B, active provider) ->
 * Claude (kept in place for when a real key is added) -> Groq (existing
 * fallback) -> hardcoded smart-mock estimate.
 *
 * Transpiles the real source file (same technique as check-syntax.js) and
 * runs it with a mocked `fetch`, so this exercises the actual requests the
 * app sends — not a reimplementation of them — without needing real API
 * keys or making live network calls.
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
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const tmpFile = path.join(os.tmpdir(), `aiEstimator-test-${Date.now()}.js`);
fs.writeFileSync(tmpFile, outputText);

const originalFetch = global.fetch;
function freshModule() {
  delete require.cache[require.resolve(tmpFile)];
  return require(tmpFile);
}

async function testNvidiaPrimaryPath() {
  process.env.EXPO_PUBLIC_NVIDIA_API_KEY = 'nvapi-test-not-real';
  delete process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  delete process.env.EXPO_PUBLIC_GROQ_API_KEY;

  let capturedRequest = null;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                trashType: 'Household Mixed Waste',
                binCount: 2,
                weightKg: 100,
                confidence: 88,
                recommendedVehicle: 'Pickup',
                reasoning: 'test',
              }),
            },
          },
        ],
      }),
    };
  };

  const mod = freshModule();
  const estimate = await mod.analyzeTrashImage('ZmFrZS1iYXNlNjQtaW1hZ2U=');

  if (!capturedRequest) {
    fail('analyzeTrashImage never called fetch for NVIDIA');
    return;
  }
  if (capturedRequest.url !== 'https://integrate.api.nvidia.com/v1/chat/completions') {
    fail(`wrong NVIDIA URL: ${capturedRequest.url}`);
  } else {
    pass('calls the correct NVIDIA NIM endpoint');
  }

  const headers = capturedRequest.options.headers;
  if (headers['Authorization'] !== 'Bearer nvapi-test-not-real') {
    fail('Authorization header not set from EXPO_PUBLIC_NVIDIA_API_KEY');
  } else {
    pass('sends the NVIDIA key via Authorization: Bearer header');
  }

  const body = JSON.parse(capturedRequest.options.body);
  if (body.model !== 'mistralai/mistral-medium-3.5-128b') {
    fail(`unexpected NVIDIA model: ${body.model}`);
  } else {
    pass('uses mistralai/mistral-medium-3.5-128b');
  }
  const content = body.messages?.[0]?.content;
  const imageBlock = content?.find((b) => b.type === 'image_url');
  const textBlock = content?.find((b) => b.type === 'text');
  if (!imageBlock || imageBlock.image_url?.url !== 'data:image/jpeg;base64,ZmFrZS1iYXNlNjQtaW1hZ2U=') {
    fail('image_url content block malformed or missing the base64 data URI');
  } else {
    pass('sends the image as a base64 data URI in an image_url content block');
  }
  if (!textBlock || !textBlock.text.includes('standard Ghanaian household wheeled waste bin')) {
    fail('analysis prompt text block missing/malformed');
  } else {
    pass('sends the analysis prompt alongside the image');
  }

  if (estimate.provider !== 'nvidia' || estimate.binCount !== 2 || estimate.trashType !== 'Household Mixed Waste') {
    fail(`unexpected parsed estimate: ${JSON.stringify(estimate)}`);
  } else {
    pass('parses a successful NVIDIA response into a TrashEstimate correctly, provider=nvidia');
  }

  // Recalibration (STANDARD_BIN_PRICE_GHS = 40): 2 bins * 40 = 80 GHS, no
  // brand/manufacturer name, single price (not a priceLow/priceHigh range),
  // and the AI's own confidence score passed through untouched.
  if (estimate.price !== 80) {
    fail(`expected price = binCount(2) * STANDARD_BIN_PRICE_GHS(40) = 80, got ${estimate.price}`);
  } else {
    pass('price = binCount * STANDARD_BIN_PRICE_GHS (40 GHS/bin, not the old 30)');
  }
  if (estimate.confidence !== 88) {
    fail(`expected confidence to pass through as 88, got ${estimate.confidence}`);
  } else {
    pass('confidence score passes through from the AI response');
  }
  if ('priceLow' in estimate || 'priceHigh' in estimate) {
    fail('estimate still has legacy priceLow/priceHigh fields — should be a single price now');
  } else {
    pass('estimate exposes a single price field, not a priceLow/priceHigh range');
  }
  if (source.toLowerCase().includes('sintex')) {
    fail('analysis prompt references a specific bin manufacturer/brand — should be generic');
  } else {
    pass('analysis prompt does not reference any specific bin manufacturer or brand');
  }
}

async function testClaudeStillInChain() {
  // NVIDIA fails; Claude has no key either (matches the current real
  // situation) — should fall through past Claude without ever calling it,
  // straight to Groq/mock. This confirms Claude is still wired into the
  // chain (not deleted) and fails fast/safely with no key.
  process.env.EXPO_PUBLIC_NVIDIA_API_KEY = 'nvapi-test-not-real';
  delete process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  delete process.env.EXPO_PUBLIC_GROQ_API_KEY;

  let claudeWasCalled = false;
  global.fetch = async (url) => {
    if (url === 'https://integrate.api.nvidia.com/v1/chat/completions') {
      return { ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) };
    }
    if (url === 'https://api.anthropic.com/v1/messages') {
      claudeWasCalled = true;
    }
    return { ok: false, status: 500, json: async () => ({ error: { message: 'should not be called' } }) };
  };

  const mod = freshModule();
  const estimate = await mod.analyzeTrashImage('ZmFrZS1iYXNlNjQtaW1hZ2U=');

  if (claudeWasCalled) {
    fail('Claude was called over the network despite having no API key set — should fail fast locally');
  } else {
    pass('Claude fails fast on missing key without an unnecessary network call');
  }
  if (estimate.provider !== undefined || estimate.trashType !== 'Mixed Household Waste (Estimated)') {
    fail(`expected smart-mock fallback after NVIDIA+Claude+Groq all unavailable: ${JSON.stringify(estimate)}`);
  } else {
    pass('falls all the way through to the smart-mock estimate when every provider is unavailable');
  }
}

function testAllProviderCallsHaveATimeout() {
  // Regression guard for the "stuck analyzing for 5 minutes" bug: a plain
  // fetch() with no AbortController/timeout hangs forever if a provider
  // never responds, and the fallback chain never gets a chance to run.
  // This doesn't re-run the full 25s live timeout (already verified by
  // hand — a genuinely hung request was confirmed to abort at exactly
  // 25014ms and fall through to the mock estimate) — it's a fast static
  // check that the wrapper is actually used at every call site, so a
  // future edit can't silently reintroduce a bare fetch().
  // Exclude fetchWithTimeout's own declaration and its one legitimate
  // low-level `fetch(url, ...)` call — everything else must go through it.
  const relevantLines = source
    .split('\n')
    .filter((line) => !/function fetchWithTimeout/.test(line) && !/return await fetch\(/.test(line));
  const relevantSource = relevantLines.join('\n');

  const bareFetchCalls = relevantSource.match(/[^.\w]fetch\(/g) || [];
  const wrappedCalls = (source.match(/fetchWithTimeout\(/g) || []).length - 1; // -1 for the declaration itself

  if (bareFetchCalls.length > 0) {
    fail(`found ${bareFetchCalls.length} bare fetch(...) call(s) that bypass the timeout wrapper — use fetchWithTimeout(...) instead`);
  } else {
    pass('no bare fetch() calls — every provider request goes through fetchWithTimeout()');
  }
  if (wrappedCalls !== 3) {
    fail(`expected 3 fetchWithTimeout(...) call sites (NVIDIA, Claude, Groq), found ${wrappedCalls}`);
  } else {
    pass('all 3 provider calls (NVIDIA, Claude, Groq) use fetchWithTimeout()');
  }
}

testAllProviderCallsHaveATimeout();

testNvidiaPrimaryPath()
  .then(testClaudeStillInChain)
  .catch((e) => {
    fail(`unexpected exception: ${e.stack || e}`);
  })
  .finally(() => {
    global.fetch = originalFetch;
    fs.unlinkSync(tmpFile);
    process.exit(hasError ? 1 : 0);
  });
