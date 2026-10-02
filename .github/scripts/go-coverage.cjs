'use strict';

const { execFileSync } = require('node:child_process');
const MINIMUM_COVERAGE = 30;

function aggregateCoverage(output) {
  // Function names and paths can contain "total". Only the aggregate row
  // reports project coverage, and missing/duplicate/invalid rows must fail.
  const rows = output.split(/\r?\n/).map(line => line.trim())
    .filter(line => line.startsWith('total:'));
  if (rows.length !== 1) throw new Error('Expected exactly one aggregate coverage row');
  const match = /^total:\s+\(statements\)\s+(\d+(?:\.\d+)?)%$/.exec(rows[0]);
  if (!match) throw new Error('Invalid aggregate coverage row');
  const coverage = Number(match[1]);
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 100) {
    throw new Error('Aggregate coverage must be between 0 and 100');
  }
  return coverage;
}

function run(profile) {
  const output = execFileSync('go', ['tool', 'cover', `-func=${profile}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const coverage = aggregateCoverage(output);
  console.log(`Total coverage: ${coverage}%`);
  if (coverage < MINIMUM_COVERAGE) {
    throw new Error(`Coverage ${coverage}% is below threshold ${MINIMUM_COVERAGE}%`);
  }
  return coverage;
}

if (require.main === module) {
  try { run(process.argv[2] || 'coverage.out'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { aggregateCoverage, run, MINIMUM_COVERAGE };
