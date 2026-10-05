import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function collectLighthouseReports({
  url,
  outputDirectory,
  lighthouseCli = require.resolve('lighthouse/cli/index.js'),
}) {
  mkdirSync(outputDirectory, { recursive: true });
  const reports = [];
  for (let run = 1; run <= 3; run++) {
    const report = path.resolve(outputDirectory, `report-${run}.json`);
    rmSync(report, { force: true });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = spawnSync(process.execPath, [
        lighthouseCli, url,
        '--chrome-flags=--headless --no-sandbox',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--output=json', `--output-path=${report}`, '--quiet',
      ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      if (result.error) throw result.error;
      if (result.status === 0) {
        const data = JSON.parse(readFileSync(report, 'utf8'));
        if (data.runtimeError) throw new Error(`Lighthouse runtime failure: ${data.runtimeError.code}`);
        reports.push(report);
        break;
      }
      // Retry only a failed browser launch before measurements exist. Never
      // retry measured failures, budget failures, crashes, or unknown errors.
      const startupFailure = result.signal === null
        && /^Unable to connect to Chrome\r?$/m.test(result.stderr || '')
        && !existsSync(report);
      if (!startupFailure || attempt === 3) {
        throw new Error(`Lighthouse run ${run} failed (status ${result.status}, signal ${result.signal})`);
      }
      console.error(`Chrome startup failed; retrying Lighthouse run ${run} (${attempt + 1}/3).`);
    }
  }
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [url, outputDirectory = '.lighthouseci'] = process.argv.slice(2);
  if (!url) throw new Error('Usage: node run-lighthouse.mjs URL [output-directory]');
  collectLighthouseReports({ url, outputDirectory });
}
