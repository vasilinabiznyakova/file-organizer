import { EventEmitter } from 'node:events';
import { unlink } from 'node:fs/promises';
import { getFileData, listFiles, formatError } from './utils.js';

export class Cleaner extends EventEmitter {
  async cleanup(directory, days, { dryRun = false } = {}) {
    if (!Number.isFinite(days) || days < 0) throw new Error('Кількість днів має бути невід’ємним числом.');
    const paths = await listFiles(directory);
    const cutoff = Date.now() - days * 86_400_000;
    const result = { dryRun, matched: 0, removed: 0, freedSize: 0, files: [], errors: [] };

    for (const file of paths) {
      try {
        const data = await getFileData(file);
        if (data.mtime.getTime() >= cutoff) continue;
        result.matched += 1;
        result.files.push(data);
        if (!dryRun) {
          try { await unlink(file); } catch (error) { throw new Error(formatError(error, file), { cause: error }); }
          result.removed += 1;
        }
        result.freedSize += data.size;
        this.emit(dryRun ? 'file-matched' : 'file-removed', data, result.matched);
      } catch (error) {
        result.errors.push(error.message);
        this.emit('file-error', error, file);
      }
    }
    this.emit('cleanup-complete', result);
    return result;
  }
}
