import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Scanner } from '../src/scanner.js';
import { DuplicateFinder } from '../src/duplicate-finder.js';
import { Organizer, categoryFor } from '../src/organizer.js';
import { Cleaner } from '../src/cleanup.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'file-organizer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nested'));
  await writeFile(path.join(root, 'report.txt'), 'same content');
  await writeFile(path.join(root, 'nested', 'copy.txt'), 'same content');
  await writeFile(path.join(root, 'photo.png'), 'image');
  return root;
}

test('Scanner collects recursive statistics', async (t) => {
  const root = await fixture(t);
  const result = await new Scanner().scan(root);
  assert.equal(result.totalFiles, 3);
  assert.equal(result.byType.get('.txt').count, 2);
  assert.equal(result.largest.length, 3);
  assert.ok(result.oldest);
});

test('DuplicateFinder groups files with identical content', async (t) => {
  const root = await fixture(t);
  const result = await new DuplicateFinder().find(root);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].files.length, 2);
  assert.equal(result.wasted, Buffer.byteLength('same content'));
  assert.equal(result.hashedFiles, 3);
});

test('Organizer resolves repeated filename collisions', async (t) => {
  const root = await fixture(t);
  const output = path.join(root, 'sorted');
  const organizer = new Organizer();
  await organizer.organize(root, output);
  const second = await organizer.organize(root, output);
  assert.equal(second.copied, 3);
  assert.equal(await readFile(path.join(output, 'Documents', 'report (1).txt'), 'utf8'), 'same content');
});

test('Organizer copies a 10 MB file through the large-file path', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'file-organizer-large-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'large.bin');
  await writeFile(source, Buffer.alloc(10 * 1024 * 1024, 7));
  const output = path.join(root, 'sorted');
  const result = await new Organizer().organize(root, output);
  const copied = path.join(output, 'Other', 'large.bin');
  assert.equal(result.copied, 1);
  assert.equal((await stat(copied)).size, 10 * 1024 * 1024);
});

test('Organizer copies files into categories without changing sources', async (t) => {
  const root = await fixture(t);
  const output = path.join(root, 'sorted');
  const result = await new Organizer().organize(root, output);
  assert.equal(result.copied, 3);
  assert.equal(await readFile(path.join(output, 'Documents', 'report.txt'), 'utf8'), 'same content');
  assert.equal(await readFile(path.join(output, 'Images', 'photo.png'), 'utf8'), 'image');
  assert.equal(await readFile(path.join(root, 'report.txt'), 'utf8'), 'same content');
  assert.equal(categoryFor('.unknown'), 'Other');
});

test('Cleaner previews and then removes old files', async (t) => {
  const root = await fixture(t);
  const oldFile = path.join(root, 'report.txt');
  const oldDate = new Date(Date.now() - 100 * 86_400_000);
  await utimes(oldFile, oldDate, oldDate);

  const preview = await new Cleaner().cleanup(root, 30, { dryRun: true });
  assert.equal(preview.matched, 1);
  assert.equal(preview.removed, 0);
  assert.ok(await stat(oldFile));

  const result = await new Cleaner().cleanup(root, 30);
  assert.equal(result.removed, 1);
  await assert.rejects(stat(oldFile), { code: 'ENOENT' });
});
