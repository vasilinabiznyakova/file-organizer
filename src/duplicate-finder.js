import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { EventEmitter } from 'node:events';
import { formatError, getFileData, listFiles } from './utils.js';

async function sha256(file) {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  } catch (error) {
    throw new Error(formatError(error, file), { cause: error });
  }
}

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    const paths = await listFiles(directory);
    const files = [];
    const errors = [];

    for (const file of paths) {
      try {
        files.push(await getFileData(file));
      } catch (error) {
        errors.push(error.message);
        this.emit('file-error', error, file);
      }
    }

    const byHash = new Map();
    let processed = 0;
    for (const data of files) {
      try {
        const hash = await sha256(data.path);
        const group = byHash.get(hash) ?? [];
        group.push(data);
        byHash.set(hash, group);
      } catch (error) {
        errors.push(error.message);
        this.emit('file-error', error, data.path);
      } finally {
        processed += 1;
        this.emit('hash-calculated', data, processed, files.length);
      }
    }

    const groups = [...byHash.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([hash, files]) => ({ hash, files, size: files[0].size, wasted: files[0].size * (files.length - 1) }));
    const result = { scannedFiles: paths.length, hashedFiles: files.length, groups, wasted: groups.reduce((sum, group) => sum + group.wasted, 0), errors };
    this.emit('search-complete', result);
    return result;
  }
}
