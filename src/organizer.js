import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { copyFileEfficient, formatError, getFileData, listFiles, uniqueDestination } from './utils.js';

const CATEGORY_EXTENSIONS = {
  Documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
  Code: ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.py', '.java', '.c', '.cpp', '.go', '.rs'],
  Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v'],
};

export function categoryFor(extension) {
  return Object.entries(CATEGORY_EXTENSIONS).find(([, extensions]) => extensions.includes(extension))?.[0] ?? 'Other';
}

async function availableDestination(directory, filename, occupied) {
  let candidate = uniqueDestination(directory, filename, occupied);
  while (true) {
    try {
      await access(candidate);
      candidate = uniqueDestination(directory, filename, occupied);
    } catch (error) {
      if (error.code === 'ENOENT') return candidate;
      throw new Error(formatError(error, candidate), { cause: error });
    }
  }
}

export class Organizer extends EventEmitter {
  async organize(directory, output = path.join(path.resolve(directory), 'Organized')) {
    const root = path.resolve(directory);
    const destinationRoot = path.resolve(output);
    if (destinationRoot === root) throw new Error('Вихідна директорія має відрізнятися від вихідної.');
    const outputIsInsideSource = destinationRoot.startsWith(`${root}${path.sep}`);
    const paths = await listFiles(root, { exclude: outputIsInsideSource ? [destinationRoot] : [] });
    const occupied = new Set();
    const result = { output: destinationRoot, copied: 0, totalSize: 0, byCategory: new Map(), errors: [] };

    for (const file of paths) {
      try {
        const data = await getFileData(file);
        const category = categoryFor(data.extension);
        const categoryDir = path.join(destinationRoot, category);
        const candidate = await availableDestination(categoryDir, data.name, occupied);
        await copyFileEfficient(file, candidate, data.size);
        result.copied += 1;
        result.totalSize += data.size;
        result.byCategory.set(category, (result.byCategory.get(category) ?? 0) + 1);
        this.emit('file-copied', { ...data, category, destination: candidate }, result.copied, paths.length);
      } catch (error) {
        result.errors.push(error.message);
        this.emit('file-error', error, file);
      }
    }
    this.emit('organize-complete', result);
    return result;
  }
}
