import { Database } from 'bun:sqlite';
import path from 'node:path';

import type { ProtonDriveCache, EntityResult } from '../../../sdk/src';

export class SQLiteEntititesCache implements ProtonDriveCache<string> {
    private db: Database;

    constructor(cacheDir: string) {
        const cacheFile = path.join(cacheDir, 'cache-entities.sqlite');
        this.db = new Database(cacheFile, { create: true });
        this.db.run('CREATE TABLE IF NOT EXISTS entities (key TEXT PRIMARY KEY, value TEXT)');
        this.db.run('CREATE TABLE IF NOT EXISTS entities_labels (label TEXT, key TEXT, UNIQUE (label, key))');
    }

    async clear() {
        this.db.run('DELETE FROM entities');
        this.db.run('DELETE FROM entities_labels');
    }

    async setEntity(key: string, data: string, tags?: string[]) {
        const query = this.db.query('INSERT OR REPLACE INTO entities (key, value) VALUES ($key, $data)');
        query.run({ $key: key, $data: data });

        // Remove previous tags.
        const deleteQuery = this.db.query('DELETE FROM entities_labels WHERE key = $key');
        deleteQuery.run({ $key: key });

        for (const tag of tags || []) {
            const insertQuery = this.db.query(
                'INSERT OR REPLACE INTO entities_labels (label, key) VALUES ($tag, $key)',
            );
            insertQuery.run({ $tag: tag, $key: key });
        }
    }

    async getEntity(key: string) {
        const query = this.db.query('SELECT value FROM entities WHERE key = $key');
        const result = query.get({ $key: key });
        if (!result) {
            throw Error(`Entity ${key} not found`);
        }
        // @ts-expect-error - SQLite returns unknown type.
        return result['value'];
    }

    async *iterateEntities(keys: string[]): AsyncGenerator<EntityResult<string>> {
        for (const key of keys) {
            try {
                const value = await this.getEntity(key);
                yield { key, ok: true, value };
            } catch (error) {
                yield { key, ok: false, error: `${error}` };
            }
        }
    }

    async *iterateEntitiesByTag(tag: string): AsyncGenerator<EntityResult<string>> {
        const query = this.db.query('SELECT key FROM entities_labels WHERE label = $tag');
        const result = query.all({ $tag: tag });
        // @ts-expect-error - SQLite returns unknown type.
        yield* this.iterateEntities(result.map((row) => row['key']));
    }

    async removeEntities(keys: string[]) {
        for (const key of keys) {
            const query1 = this.db.query('DELETE FROM entities WHERE key = $key');
            query1.run({ $key: key });
            const query2 = this.db.query('DELETE FROM entities_labels WHERE key = $key');
            query2.run({ $key: key });
        }
    }
}
