#!/usr/bin/env node
/**
 * Regression guard added for BC-001 (App.tsx failed to compile due to a
 * duplicate `const [isSearchingLocation, setIsSearchingLocation] = useState(...)`
 * declaration in the same scope).
 *
 * This performs a single-file syntactic transpile (no cross-file type-checking)
 * so it fails fast on real syntax errors — duplicate `const`/`let` declarations,
 * unclosed braces, etc. — without being polluted by unrelated, pre-existing
 * semantic/type errors elsewhere in the project.
 *
 * Usage: node scripts/verify/check-syntax.js [file ...]
 * Defaults to the app's top-level entry files if none are given.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const REPO_ROOT = path.join(__dirname, '..', '..');

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['App.tsx', 'web-admin/src/App.tsx'];

let hasError = false;

for (const relPath of targets) {
  const filePath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.error(`[check-syntax] SKIP (not found): ${relPath}`);
    continue;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
    fileName: filePath,
  });

  const syntaxErrors = (result.diagnostics || []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  );

  if (syntaxErrors.length > 0) {
    hasError = true;
    console.error(`[check-syntax] FAIL: ${relPath} (${syntaxErrors.length} syntax error(s))`);
    for (const d of syntaxErrors) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        console.error(`  ${relPath}:${line + 1}:${character + 1} - ${msg}`);
      } else {
        console.error(`  ${msg}`);
      }
    }
  } else {
    console.log(`[check-syntax] PASS: ${relPath}`);
  }
}

process.exit(hasError ? 1 : 0);
