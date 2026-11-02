import type { CreatePotholeInput } from '@hufra/contracts';
import * as SQLite from 'expo-sqlite';

import type { PickedPhoto } from '../report/photo-pick';
import type { SubmitState } from '../report/submit';

export type OutboxStatus = 'pending' | 'failed';

/** A report kept on the phone until it reaches the server. */
export interface OutboxItem {
  /** The report's device id (client_report_uuid): re-sends never create a second report. */
  uuid: string;
  createdAt: string;
  input: CreatePotholeInput;
  /** Copies in the app's own folder, so the system cannot clean them up. */
  photos: PickedPhoto[];
  state: SubmitState;
  attempts: number;
  status: OutboxStatus;
  /** Plain reason for a failed item (server message), shown to the person. */
  lastError: string | null;
}

export interface OutboxStore {
  list(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(uuid: string): Promise<void>;
}

type Row = {
  uuid: string;
  created_at: string;
  input: string;
  photos: string;
  state: string;
  attempts: number;
  status: OutboxStatus;
  last_error: string | null;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS outbox (
    uuid TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    input TEXT NOT NULL,
    photos TEXT NOT NULL,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT
  );`;

/** SQLite on the phone (expo-sqlite): survives restarts and a full battery drain. */
export function createSqliteOutbox(dbName = 'hufra-outbox.db'): OutboxStore {
  let db: Promise<SQLite.SQLiteDatabase> | null = null;
  const open = () => {
    db ??= SQLite.openDatabaseAsync(dbName).then(async (d) => {
      await d.execAsync(SCHEMA);
      return d;
    });
    return db;
  };
  return {
    async list() {
      const rows = await (await open()).getAllAsync<Row>('SELECT * FROM outbox ORDER BY created_at ASC');
      return rows.map((r) => ({
        uuid: r.uuid,
        createdAt: r.created_at,
        input: JSON.parse(r.input),
        photos: JSON.parse(r.photos),
        state: JSON.parse(r.state),
        attempts: r.attempts,
        status: r.status,
        lastError: r.last_error,
      }));
    },
    async put(i) {
      await (await open()).runAsync(
        `INSERT OR REPLACE INTO outbox (uuid, created_at, input, photos, state, attempts, status, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        i.uuid,
        i.createdAt,
        JSON.stringify(i.input),
        JSON.stringify(i.photos),
        JSON.stringify(i.state),
        i.attempts,
        i.status,
        i.lastError,
      );
    },
    async remove(uuid) {
      await (await open()).runAsync('DELETE FROM outbox WHERE uuid = ?', uuid);
    },
  };
}

/** In-memory store for tests. */
export function memoryOutbox(initial: OutboxItem[] = []): OutboxStore {
  const items = new Map(initial.map((i) => [i.uuid, i]));
  return {
    list: async () => [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    put: async (i) => {
      items.set(i.uuid, structuredClone(i));
    },
    remove: async (uuid) => {
      items.delete(uuid);
    },
  };
}
