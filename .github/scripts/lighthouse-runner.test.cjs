'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const runner = import('../../frontend/scripts/run-lighthouse.mjs');

function fixture(t, mode) {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'lighthouse-runner-'));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const lighthouseCli = path.join(outputDirectory, 'fake-lighthouse.cjs');
  writeFileSync(lighthouseCli, `
    const fs = require('node:fs');
    const mode = ${JSON.stringify(mode)};
    const report = process.argv.find(arg => arg.startsWith('--output-path=')).slice(14);
    const counter = report + '.attempts';
    const attempt = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) + 1 : 1;
    fs.writeFileSync(counter, String(attempt));
    if (mode === 'recover' && attempt > 2) {
      fs.writeFileSync(report, JSON.stringify({ categories: {}, attempt }));
    } else if (mode === 'missing-report') {
      process.exit(0);
    } else {
      if (mode === 'measured-failure') fs.writeFileSync(report, JSON.stringify({ runtimeError: { code: 'PAGE_HUNG' } }));
      console.error(mode === 'unknown' ? 'PAGE_HUNG' : 'Unable to connect to Chrome');
      process.exit(1);
    }
  `);
  return { url: 'http://127.0.0.1:4173/', outputDirectory, lighthouseCli };
}

const attempts = (options, run = 1) => Number(readFileSync(
  path.join(options.outputDirectory, `report-${run}.json.attempts`), 'utf8'));

test('recovers a Chrome startup failure and produces all three reports', async t => {
  const options = fixture(t, 'recover');
  const reports = (await runner).collectLighthouseReports(options);
  assert.equal(reports.length, 3);
  for (let run = 1; run <= 3; run++) {
    assert.equal(attempts(options, run), 3);
    assert.equal(JSON.parse(readFileSync(reports[run - 1], 'utf8')).attempt, 3);
  }
});

test('stops after three failed Chrome startup attempts', async t => {
  const options = fixture(t, 'unavailable');
  const { collectLighthouseReports } = await runner;
  assert.throws(() => collectLighthouseReports(options), /Lighthouse run 1 failed/);
  assert.equal(attempts(options), 3);
});

for (const mode of ['unknown', 'measured-failure']) {
  test(`does not retry ${mode}`, async t => {
    const options = fixture(t, mode);
    const { collectLighthouseReports } = await runner;
    assert.throws(() => collectLighthouseReports(options), /Lighthouse run 1 failed/);
    assert.equal(attempts(options), 1);
  });
}

test('a successful exit without a report still fails', async t => {
  const options = fixture(t, 'missing-report');
  const { collectLighthouseReports } = await runner;
  assert.throws(() => collectLighthouseReports(options), /ENOENT/);
  assert.equal(attempts(options), 1);
});
