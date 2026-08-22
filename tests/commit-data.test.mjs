/**
 * Reproduces the failure seen in CI on 2026-08-22: a data run committed 749
 * regenerated files, another run pushed to main while it was working, and
 * `git pull --rebase` stopped on conflicts in data/bills/index.json and
 * data/votes/index.json, so the run exited 1 and its data was lost.
 *
 * Uses local bare repositories, so no network is involved.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const commitDataScript = fileURLToPath(new URL('../scripts/commit-data.sh', import.meta.url));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function writeJSON(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** A bare "origin" plus a clone standing in for a workflow runner. */
function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), 'commit-data-'));
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const runner = join(root, 'runner');

  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', '--quiet', origin, seed);
  git(seed, 'config', 'user.email', 'seed@example.com');
  git(seed, 'config', 'user.name', 'Seed');

  writeJSON(join(seed, 'data', 'bills', 'index.json'), { total: 1, bills: ['hr1'] });
  writeJSON(join(seed, 'data', 'votes', 'index.json'), { total: 1, votes: ['h1'] });
  writeJSON(join(seed, 'data', 'meta', 'last-updated.json'), { bills: 'day-one' });
  writeFileSync(join(seed, 'README.md'), 'seed\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '--quiet', '-m', 'seed');
  git(seed, 'push', '--quiet', 'origin', 'main');

  git(root, 'clone', '--quiet', origin, runner);
  git(runner, 'config', 'user.email', 'runner@example.com');
  git(runner, 'config', 'user.name', 'Runner');

  return { origin, seed, runner };
}

function runCommitData(cwd, message, paths) {
  return execFileSync('bash', [commitDataScript, message, ...paths], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, DATA_PUSH_ATTEMPTS: '3' },
  });
}

function fileOnMain(origin, path) {
  const raw = execFileSync('git', ['show', `main:${path}`], { cwd: origin, encoding: 'utf-8' });
  return JSON.parse(raw);
}

test('regenerated data is pushed even when another run rewrote the same file first', () => {
  const { origin, seed, runner } = setupRepo();

  // The run regenerates its data.
  writeJSON(join(runner, 'data', 'bills', 'index.json'), { total: 2, bills: ['hr1', 'hr2'] });
  writeJSON(join(runner, 'data', 'bills', 'hr2.json'), { billId: 'hr2' });

  // Another run pushes a conflicting rewrite of the same aggregate file.
  writeJSON(join(seed, 'data', 'bills', 'index.json'), { total: 99, bills: ['other'] });
  git(seed, 'commit', '--quiet', '-am', 'concurrent bills update');
  git(seed, 'push', '--quiet', 'origin', 'main');

  const output = runCommitData(runner, 'chore: update bills data', ['data/bills/', 'data/meta/']);
  assert.match(output, /Pushed data/);

  assert.deepEqual(fileOnMain(origin, 'data/bills/index.json'), { total: 2, bills: ['hr1', 'hr2'] });
  assert.deepEqual(fileOnMain(origin, 'data/bills/hr2.json'), { billId: 'hr2' });
});

test('a run only rewrites the paths it owns', () => {
  const { origin, seed, runner } = setupRepo();

  writeJSON(join(runner, 'data', 'votes', 'index.json'), { total: 2, votes: ['h1', 'h2'] });

  // A bills run publishes new bills data plus a source change in the meantime.
  writeJSON(join(seed, 'data', 'bills', 'index.json'), { total: 50, bills: ['hr50'] });
  writeFileSync(join(seed, 'README.md'), 'updated by someone else\n');
  git(seed, 'commit', '--quiet', '-am', 'concurrent bills update and readme edit');
  git(seed, 'push', '--quiet', 'origin', 'main');

  runCommitData(runner, 'chore: update votes data', ['data/votes/', 'data/meta/']);

  assert.deepEqual(fileOnMain(origin, 'data/votes/index.json'), { total: 2, votes: ['h1', 'h2'] });
  // Untouched by the votes run.
  assert.deepEqual(fileOnMain(origin, 'data/bills/index.json'), { total: 50, bills: ['hr50'] });
  assert.equal(
    execFileSync('git', ['show', 'main:README.md'], { cwd: origin, encoding: 'utf-8' }),
    'updated by someone else\n'
  );
});

test('an unchanged run reports no changes and pushes nothing', () => {
  const { origin, runner } = setupRepo();
  const before = git(origin, 'rev-parse', 'main').trim();

  const output = runCommitData(runner, 'chore: update bills data', ['data/bills/']);

  assert.match(output, /No data changes detected/);
  assert.equal(git(origin, 'rev-parse', 'main').trim(), before);
});

test('data identical to a concurrent push is not committed again', () => {
  const { origin, seed, runner } = setupRepo();

  const regenerated = { total: 2, bills: ['hr1', 'hr2'] };
  writeJSON(join(runner, 'data', 'bills', 'index.json'), regenerated);

  writeJSON(join(seed, 'data', 'bills', 'index.json'), regenerated);
  git(seed, 'commit', '--quiet', '-am', 'concurrent identical update');
  git(seed, 'push', '--quiet', 'origin', 'main');
  const afterConcurrent = git(origin, 'rev-parse', 'main').trim();

  const output = runCommitData(runner, 'chore: update bills data', ['data/bills/']);

  assert.match(output, /already matches/);
  assert.equal(git(origin, 'rev-parse', 'main').trim(), afterConcurrent);
});

test('the commit message and history stay readable', () => {
  const { origin, runner } = setupRepo();
  writeJSON(join(runner, 'data', 'bills', 'index.json'), { total: 3, bills: ['hr3'] });

  runCommitData(runner, 'chore: update bills data [2026-08-22]', ['data/bills/']);

  const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: origin, encoding: 'utf-8' });
  assert.match(log, /chore: update bills data \[2026-08-22\]/);
  assert.equal(readFileSync(join(runner, 'data', 'bills', 'index.json'), 'utf-8').includes('"total": 3'), true);
});
