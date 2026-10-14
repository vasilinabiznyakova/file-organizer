import { EventEmitter } from 'node:events';
import { getFileData, listFiles } from './utils.js';

export class Scanner extends EventEmitter {
  async scan(directory) {
    const paths = await listFiles(directory);
    const now = Date.now();
    const statistics = {
      directory,
      totalFiles: 0,
      totalSize: 0,
      byType: new Map(),
      age: { last7Days: 0, last30Days: 0, olderThan90Days: 0 },
      largest: [],
      oldest: null,
      errors: [],
    };

    for (const file of paths) {
      try {
        const data = await getFileData(file);
        statistics.totalFiles += 1;
        statistics.totalSize += data.size;
        const type = statistics.byType.get(data.extension) ?? { count: 0, totalSize: 0 };
        type.count += 1;
        type.totalSize += data.size;
        statistics.byType.set(data.extension, type);

        const ageDays = (now - data.mtime.getTime()) / 86_400_000;
        if (ageDays <= 7) statistics.age.last7Days += 1;
        if (ageDays <= 30) statistics.age.last30Days += 1;
        if (ageDays > 90) statistics.age.olderThan90Days += 1;

        statistics.largest.push(data);
        statistics.largest.sort((a, b) => b.size - a.size);
        statistics.largest.length = Math.min(statistics.largest.length, 3);
        if (!statistics.oldest || data.mtime < statistics.oldest.mtime) statistics.oldest = data;
        this.emit('file-found', data, statistics.totalFiles, paths.length);
      } catch (error) {
        statistics.errors.push(error.message);
        this.emit('file-error', error, file);
      }
    }

    this.emit('scan-complete', statistics);
    return statistics;
  }
}
