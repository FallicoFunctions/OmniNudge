'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { aggregateCoverage } = require('./go-coverage.cjs');

const table = value => `example/total.go:3: total 100.0%\nexample/a.go:4: subtotal 100.0%\ntotal: (statements) ${value}%\n`;

test('aggregate row excludes total-looking function names and paths', () => {
  assert.equal(aggregateCoverage(table(51.2)), 51.2);
  assert.equal(aggregateCoverage(table(29.9)), 29.9);
});

test('missing, duplicate, malformed and out-of-range aggregate rows fail closed', () => {
  for (const output of ['', 'example/a.go:1: total 100.0%',
    table(30) + 'total: (statements) 100.0%\n', table('NaN'), table(100.1),
    table(-1), 'total: (statements) 30\n']) {
    assert.throws(() => aggregateCoverage(output));
  }
  assert.equal(aggregateCoverage(table(0)), 0);
  assert.equal(aggregateCoverage(table(100)), 100);
});

test('CLI contract rejects low coverage and tool errors, accepts the exact threshold', () => {
  const original = childProcess.execFileSync;
  let output = table(29.9);
  childProcess.execFileSync = (command, args) => {
    assert.equal(command, 'go');
    assert.deepEqual(args, ['tool', 'cover', '-func=controlled.out']);
    if (output instanceof Error) throw output;
    return output;
  };
  delete require.cache[require.resolve('./go-coverage.cjs')];
  try {
    const { run } = require('./go-coverage.cjs');
    assert.throws(() => run('controlled.out'), /below threshold/);
    output = table(30); assert.equal(run('controlled.out'), 30);
    output = table(51.2); assert.equal(run('controlled.out'), 51.2);
    output = new Error('go cover failed');
    assert.throws(() => run('controlled.out'), /go cover failed/);
  } finally {
    childProcess.execFileSync = original;
    delete require.cache[require.resolve('./go-coverage.cjs')];
  }
});
