import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatError(error, target) {
  const messages = {
    EACCES: `Немає доступу: ${target}`,
    EPERM: `Операція заборонена: ${target}`,
    ENOENT: `Шлях не знайдено: ${target}`,
    ENOSPC: `Недостатньо місця на диску: ${target}`,
    EISDIR: `Очікувався файл, але знайдено директорію: ${target}`,
    ENOTDIR: `Очікувалася директорія: ${target}`,
  };
  return messages[error.code] ?? `Помилка для "${target}": ${error.message}`;
}

export async function assertDirectory(directory) {
  const absolute = path.resolve(directory);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) {
      const error = new Error(`Очікувалася директорія: ${absolute}`);
      error.code = 'ENOTDIR';
      throw error;
    }
    return absolute;
  } catch (error) {
    if (error.code === 'ENOTDIR') throw error;
    throw new Error(formatError(error, absolute), { cause: error });
  }
}

export async function listFiles(directory, { exclude = [] } = {}) {
  const root = await assertDirectory(directory);
  const excluded = exclude.map((item) => path.resolve(item));
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
      .filter((file) => !excluded.some((dir) => file === dir || file.startsWith(`${dir}${path.sep}`)));
  } catch (error) {
    throw new Error(formatError(error, root), { cause: error });
  }
}

export async function getFileData(file) {
  try {
    const info = await stat(file);
    return {
      path: file,
      name: path.basename(file),
      extension: path.extname(file).toLowerCase() || '(other)',
      size: info.size,
      mtime: info.mtime,
    };
  } catch (error) {
    throw new Error(formatError(error, file), { cause: error });
  }
}

export async function copyFileEfficient(source, destination, size) {
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    if (size >= LARGE_FILE_BYTES) {
      await pipeline(createReadStream(source), createWriteStream(destination, { flags: 'wx' }));
    } else {
      await copyFile(source, destination, 1);
    }
  } catch (error) {
    throw new Error(formatError(error, destination), { cause: error });
  }
}

export function uniqueDestination(directory, filename, occupied = new Set()) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  let suffix = 1;
  while (occupied.has(candidate)) {
    candidate = path.join(directory, `${stem} (${suffix})${extension}`);
    suffix += 1;
  }
  occupied.add(candidate);
  return candidate;
}
