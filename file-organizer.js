#!/usr/bin/env node
import path from 'node:path';
import { Scanner } from './src/scanner.js';
import { DuplicateFinder } from './src/duplicate-finder.js';
import { Organizer } from './src/organizer.js';
import { Cleaner } from './src/cleanup.js';
import { formatBytes } from './src/utils.js';

function usage() {
  console.log(`Використання:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <directory> [--output <directory>]
  node file-organizer.js cleanup <directory> --days <number> [--dry-run]`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function progress(label, current, total) {
  if (!process.stdout.isTTY) return;
  const width = 20;
  const filled = total === 0 ? width : Math.round((current / total) * width);
  process.stdout.write(`\r${label} ${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${current}/${total}`);
  if (current === total) process.stdout.write('\n');
}

function reportErrors(errors) {
  if (!errors.length) return;
  console.error(`\nПомилки (${errors.length}):`);
  for (const message of errors) console.error(`  - ${message}`);
}

async function runScan(directory) {
  console.log(`Scanning: ${path.resolve(directory)}`);
  const scanner = new Scanner();
  scanner.on('file-found', (_, current, total) => progress('Processing...', current, total));
  const result = await scanner.scan(directory);
  console.log('\nScan Results:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total files: ${result.totalFiles}\nTotal size: ${formatBytes(result.totalSize)}\n\nBy File Type:`);
  for (const [extension, data] of [...result.byType].sort((a, b) => b[1].totalSize - a[1].totalSize)) {
    console.log(`  ${extension.padEnd(10)} ${String(data.count).padStart(5)} files  ${formatBytes(data.totalSize)}`);
  }
  console.log(`\nFile Age:\n  Last 7 days:    ${result.age.last7Days} files\n  Last 30 days:   ${result.age.last30Days} files\n  Older than 90:  ${result.age.olderThan90Days} files`);
  console.log('\nLargest files:');
  result.largest.forEach((file, index) => console.log(`  ${index + 1}. ${file.path}  ${formatBytes(file.size)}`));
  if (result.oldest) {
    const days = Math.floor((Date.now() - result.oldest.mtime.getTime()) / 86_400_000);
    console.log(`\nOldest file: ${result.oldest.path} (modified ${days} days ago)`);
  }
  reportErrors(result.errors);
}

async function runDuplicates(directory) {
  console.log(`Searching for duplicates in: ${path.resolve(directory)}`);
  const finder = new DuplicateFinder();
  finder.on('hash-calculated', (_, current, total) => progress('Calculating hashes...', current, total));
  const result = await finder.find(directory);
  console.log(`\nFound ${result.groups.length} duplicate groups (${formatBytes(result.wasted)} wasted):`);
  result.groups.forEach((group, index) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGroup ${index + 1} (${group.files.length} copies, ${formatBytes(group.size)} each):`);
    console.log(`  SHA-256: ${group.hash}`);
    group.files.forEach((file) => console.log(`  ${file.path}`));
    console.log(`  Wasted space: ${formatBytes(group.wasted)}`);
  });
  reportErrors(result.errors);
}

async function runOrganize(directory, args) {
  const organizer = new Organizer();
  organizer.on('file-copied', (_, current, total) => progress('Copying...', current, total));
  const result = await organizer.organize(directory, option(args, '--output'));
  console.log(`Organized ${result.copied} files (${formatBytes(result.totalSize)}) into: ${result.output}`);
  for (const [category, count] of result.byCategory) console.log(`  ${category}: ${count}`);
  reportErrors(result.errors);
}

async function runCleanup(directory, args) {
  const days = Number(option(args, '--days'));
  if (!args.includes('--days') || !Number.isFinite(days)) throw new Error('Для cleanup вкажіть --days <number>.');
  const dryRun = args.includes('--dry-run');
  const cleaner = new Cleaner();
  const result = await cleaner.cleanup(directory, days, { dryRun });
  console.log(`${dryRun ? 'Would remove' : 'Removed'} ${dryRun ? result.matched : result.removed} files (${formatBytes(result.freedSize)}).`);
  for (const file of result.files) console.log(`  ${file.path}`);
  reportErrors(result.errors);
}

const [command, directory, ...args] = process.argv.slice(2);
if (!command || !directory || ['--help', '-h'].includes(command)) {
  usage();
  process.exitCode = command ? 0 : 1;
} else {
  try {
    if (command === 'scan') await runScan(directory);
    else if (command === 'duplicates') await runDuplicates(directory);
    else if (command === 'organize') await runOrganize(directory, args);
    else if (command === 'cleanup') await runCleanup(directory, args);
    else { usage(); process.exitCode = 1; }
  } catch (error) {
    console.error(`Помилка: ${error.message}`);
    process.exitCode = 1;
  }
}
