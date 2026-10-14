import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(projectRoot, 'file-organizer.js');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('CLI executes scan, duplicates, organize and cleanup workflows', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'file-organizer-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nested'));
  const oldFile = path.join(root, 'old.txt');
  await writeFile(oldFile, 'duplicate');
  await writeFile(path.join(root, 'nested', 'copy.txt'), 'duplicate');
  const oldDate = new Date(Date.now() - 100 * 86_400_000);
  await utimes(oldFile, oldDate, oldDate);

  const scan = run('scan', root);
  assert.equal(scan.status, 0, scan.stderr);
  assert.match(scan.stdout, /Total files: 2/);

  const duplicates = run('duplicates', root);
  assert.equal(duplicates.status, 0, duplicates.stderr);
  assert.match(duplicates.stdout, /Found 1 duplicate groups/);

  const output = await mkdtemp(path.join(os.tmpdir(), 'file-organizer-cli-output-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const organize = run('organize', root, '--output', output);
  assert.equal(organize.status, 0, organize.stderr);
  assert.equal((await stat(path.join(output, 'Documents', 'old.txt'))).isFile(), true);

  const preview = run('cleanup', root, '--days', '30', '--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Would remove 1 files/);
  assert.equal((await stat(oldFile)).isFile(), true);

  const cleanup = run('cleanup', root, '--days', '30');
  assert.equal(cleanup.status, 0, cleanup.stderr);
  assert.match(cleanup.stdout, /Removed 1 files/);
  await assert.rejects(stat(oldFile), { code: 'ENOENT' });
});

test('CLI reports invalid paths and cleanup arguments', () => {
  const missing = run('scan', path.join(os.tmpdir(), 'file-organizer-does-not-exist'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Помилка:/);

  const invalidDays = run('cleanup', os.tmpdir(), '--days', 'not-a-number');
  assert.equal(invalidDays.status, 1);
  assert.match(invalidDays.stderr, /--days/);
});
