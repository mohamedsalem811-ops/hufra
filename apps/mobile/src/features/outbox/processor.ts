import { ApiError } from '@/api/client';

import { SubmitError, type SubmitState } from '../report/submit';
import type { PickedPhoto } from '../report/photo-pick';
import type { OutboxItem, OutboxStore } from './store';

/**
 * What to do with an item after a failed attempt:
 *  - later: connection, timeout, server trouble or no session; try again on the next chance
 *  - permit: the photo-upload permit expired; ask for a fresh one (same report, same device id)
 *  - failed: the server refused the report itself; keep it so the person can see why and delete it
 */
export type FailureAction = 'later' | 'permit' | 'failed';

export function classifyFailure(error: unknown, state: SubmitState): FailureAction {
  const cause = error instanceof SubmitError ? error.cause : error;
  // The API client turns every connection problem into an ApiError ('network' / 'timeout').
  // Anything else happened on the phone (e.g. a photo that cannot be read): waiting for
  // a connection would never fix it, so the person sees it and can try again.
  if (!(cause instanceof ApiError)) return 'failed';
  if (cause.kind === 'network' || cause.kind === 'timeout' || cause.kind === 'unauthorized') return 'later';
  if (cause.kind === 'http' && (cause.status ?? 0) >= 500) return 'later';
  if (cause.kind === 'http' && (cause.status === 429 || cause.status === 408)) return 'later';
  // Photo upload refused after the report exists: the permit is short-lived, get a new one.
  if (state.reportId !== null && cause.kind === 'http' && (cause.status === 401 || cause.status === 403)) return 'permit';
  return 'failed';
}

export interface ProcessorDeps {
  store: OutboxStore;
  send: (item: OutboxItem) => Promise<{ reportId: number }>;
  deleteFiles: (uuid: string) => void;
  onSent?: (item: OutboxItem, reportId: number) => void;
  onChange?: () => void;
}

/**
 * Sends waiting reports one at a time, oldest first. Only one run at a time;
 * a run stops at the first "try later" (no signal means the rest would fail too).
 */
export function createOutboxProcessor(deps: ProcessorDeps) {
  let running: Promise<number> | null = null;

  async function run(): Promise<number> {
    let sent = 0;
    for (const item of await deps.store.list()) {
      if (item.status !== 'pending') continue;
      try {
        const { reportId } = await deps.send(item);
        await deps.store.remove(item.uuid);
        deps.deleteFiles(item.uuid);
        sent += 1;
        deps.onSent?.(item, reportId);
        deps.onChange?.();
      } catch (error) {
        const state: SubmitState = error instanceof SubmitError ? error.state : item.state;
        const action = classifyFailure(error, state);
        const next: OutboxItem = { ...item, attempts: item.attempts + 1, state };
        if (action === 'permit') next.state = { ...state, uploadToken: null };
        if (action === 'failed') {
          next.status = 'failed';
          const cause = error instanceof SubmitError ? error.cause : error;
          next.lastError = cause instanceof ApiError ? (cause.serverMessage?.ar ?? cause.serverMessage?.en ?? null) : null;
        }
        await deps.store.put(next);
        deps.onChange?.();
        if (action === 'later') break;
      }
    }
    return sent;
  }

  return {
    /** Starts a run, or joins the one in progress. Resolves with how many reports were sent. */
    flush(): Promise<number> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

/** A new outbox entry for a report that could not be sent now. */
export function newOutboxItem(
  uuid: string,
  input: OutboxItem['input'],
  photos: PickedPhoto[],
  state: SubmitState,
  now = new Date(),
): OutboxItem {
  return { uuid, createdAt: now.toISOString(), input, photos, state, attempts: 0, status: 'pending', lastError: null };
}
