#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const cwd = process.cwd();
const srcDir = path.resolve(cwd, 'src');
const baselinePath = path.resolve(cwd, 'scripts/i18n-hardcoded-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const FINDING_KEYS = ['alertCalls', 'confirmCalls', 'literalToastCalls'];
const TOAST_LITERAL_METHODS = new Set(['success', 'error', 'info', 'warning']);

function listSourceFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const dir = queue.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') {
          continue;
        }
        queue.push(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function getLineSnippet(lines, lineNumber) {
  return (lines[lineNumber] ?? '').trim().replace(/\s+/g, ' ');
}

function isHardcodedStringLikeArgument(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

function normalizeBaseline(rawBaseline) {
  if (rawBaseline && typeof rawBaseline === 'object' && rawBaseline.totals) {
    return {
      totals: rawBaseline.totals,
      findings: rawBaseline.findings ?? Object.fromEntries(FINDING_KEYS.map((key) => [key, []])),
    };
  }

  return {
    totals: rawBaseline ?? {
      alertCalls: 0,
      confirmCalls: 0,
      literalToastCalls: 0,
    },
    findings: Object.fromEntries(FINDING_KEYS.map((key) => [key, []])),
  };
}

if (!fs.existsSync(srcDir)) {
  console.error(`[i18n-guard] Missing src directory: ${srcDir}`);
  process.exit(1);
}

const files = listSourceFiles(srcDir);
const totals = {
  alertCalls: 0,
  confirmCalls: 0,
  literalToastCalls: 0,
};
const findings = Object.fromEntries(FINDING_KEYS.map((key) => [key, []]));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const relativePath = path.relative(cwd, file).replaceAll(path.sep, '/');
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const recordFinding = (key, node) => {
    totals[key] += 1;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const snippet = getLineSnippet(lines, line);
    findings[key].push(`${relativePath}::${snippet}`);
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'alert') {
        const firstArg = node.arguments[0];
        if (firstArg && isHardcodedStringLikeArgument(firstArg)) {
          recordFinding('alertCalls', node);
        }
      } else if (ts.isIdentifier(expression) && expression.text === 'confirm') {
        const firstArg = node.arguments[0];
        if (firstArg && isHardcodedStringLikeArgument(firstArg)) {
          recordFinding('confirmCalls', node);
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const objectName = ts.isIdentifier(expression.expression)
          ? expression.expression.text
          : undefined;
        const methodName = expression.name.text;

        if (objectName === 'window' && methodName === 'confirm') {
          const firstArg = node.arguments[0];
          if (firstArg && isHardcodedStringLikeArgument(firstArg)) {
            recordFinding('confirmCalls', node);
          }
        } else if (objectName === 'toast' && TOAST_LITERAL_METHODS.has(methodName)) {
          const firstArg = node.arguments[0];
          if (firstArg && isHardcodedStringLikeArgument(firstArg)) {
            recordFinding('literalToastCalls', node);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (updateBaseline) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ totals, findings }, null, 2)}\n`,
    'utf8'
  );
  console.log(`[i18n-guard] Updated baseline at ${baselinePath}`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    `[i18n-guard] Missing baseline file at ${baselinePath}. Run "npm run i18n:guard:update" first.`
  );
  process.exit(1);
}

const baseline = normalizeBaseline(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
const countRegressions = Object.entries(totals).filter(
  ([key, value]) => value > (baseline.totals[key] ?? 0)
);
const findingRegressions = [];

for (const key of FINDING_KEYS) {
  const baselineFindings = new Set(baseline.findings[key] ?? []);
  const newFindings = findings[key].filter((entry) => !baselineFindings.has(entry));
  if (newFindings.length > 0) {
    findingRegressions.push({ key, newFindings });
  }
}

console.log('[i18n-guard] Current counts:', totals);
console.log('[i18n-guard] Baseline counts:', baseline.totals);

if (countRegressions.length > 0 || findingRegressions.length > 0) {
  for (const [key, value] of countRegressions) {
    const baselineValue = baseline.totals[key] ?? 0;
    console.error(`[i18n-guard] Regression: ${key} is ${value}, baseline is ${baselineValue}`);
  }
  for (const { key, newFindings } of findingRegressions) {
    console.error(`[i18n-guard] Regression: ${key} has ${newFindings.length} new finding(s):`);
    for (const finding of newFindings.slice(0, 10)) {
      console.error(`  - ${finding}`);
    }
  }
  process.exit(1);
}

console.log('[i18n-guard] OK (no hardcoded string regression)');
