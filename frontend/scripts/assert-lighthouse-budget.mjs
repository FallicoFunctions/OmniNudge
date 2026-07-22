import { readFile } from 'node:fs/promises';

const reportPaths = process.argv.slice(2);
if (reportPaths.length === 0) {
  throw new Error('Pass at least one Lighthouse JSON report');
}

const reports = await Promise.all(
  reportPaths.map(async (reportPath) => JSON.parse(await readFile(reportPath, 'utf8')))
);

const median = (values) => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
};

const categoryRules = [
  { id: 'performance', minimum: 0.8, severity: 'error' },
  { id: 'accessibility', minimum: 0.9, severity: 'error' },
  { id: 'best-practices', minimum: 0.9, severity: 'error' },
  { id: 'seo', minimum: 0.8, severity: 'warning' },
];

const auditRules = [
  { id: 'total-byte-weight', maximum: 2_500_000 },
  { id: 'dom-size-insight', maximum: 1_500 },
];

let failed = false;
for (const rule of categoryRules) {
  const score = median(
    reports.map((report) => {
      const value = report.categories?.[rule.id]?.score;
      if (typeof value !== 'number') {
        throw new Error(`Lighthouse report is missing the ${rule.id} category score`);
      }
      return value;
    })
  );
  const message = `${rule.id}: ${(score * 100).toFixed(0)} (minimum ${rule.minimum * 100})`;
  if (score < rule.minimum) {
    if (rule.severity === 'error') {
      console.error(`ERROR ${message}`);
      failed = true;
    } else {
      console.warn(`WARNING ${message}`);
    }
  } else {
    console.log(`PASS ${message}`);
  }
}

for (const rule of auditRules) {
  const value = median(
    reports.map((report) => {
      const numericValue = report.audits?.[rule.id]?.numericValue;
      if (typeof numericValue !== 'number') {
        throw new Error(`Lighthouse report is missing the ${rule.id} audit value`);
      }
      return numericValue;
    })
  );
  const message = `${rule.id}: ${Math.round(value)} (maximum ${rule.maximum})`;
  if (value > rule.maximum) {
    console.error(`ERROR ${message}`);
    failed = true;
  } else {
    console.log(`PASS ${message}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
