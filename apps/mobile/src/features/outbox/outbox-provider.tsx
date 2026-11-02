import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useApi } from '@/api/api-provider';

import { useAuth } from '../auth/auth-provider';
import { preparePhoto } from '../report/photo-compress';
import type { PickedPhoto } from '../report/photo-pick';
import { submitReport, type SubmitState } from '../report/submit';
import { deletePhotos, persistPhotos } from './files';
import { createOutboxProcessor, newOutboxItem } from './processor';
import { createSqliteOutbox, type OutboxItem, type OutboxStore } from './store';

interface OutboxValue {
  items: OutboxItem[];
  /** Keeps a report on the phone; it is sent automatically when possible. */
  enqueue: (uuid: string, input: OutboxItem['input'], photos: PickedPhoto[], state: SubmitState) => Promise<void>;
  /** Try sending now (the "Send now" button, and automatic triggers). */
  flush: () => Promise<number>;
  remove: (uuid: string) => Promise<void>;
}

const OutboxContext = createContext<OutboxValue | null>(null);

/** Is the internet reachable right now? Unknown counts as yes (the request will tell). */
export async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return s.isInternetReachable !== false && s.isConnected !== false;
  } catch {
    return true;
  }
}

/**
 * Offline reporting (plan 6.3). Waiting reports are sent on start, when the
 * connection comes back and when the app returns to the foreground, only
 * while signed in (the app requires an account to report).
 */
export function OutboxProvider({ children, store: injected }: { children: ReactNode; store?: OutboxStore }) {
  const { api } = useApi();
  const { state: auth } = useAuth();
  const queryClient = useQueryClient();
  const [store] = useState(() => injected ?? createSqliteOutbox());
  const [items, setItems] = useState<OutboxItem[]>([]);
  const signedIn = auth.status === 'signedIn';

  const refresh = useCallback(async () => setItems(await store.list().catch(() => [])), [store]);

  const processor = useMemo(
    () =>
      createOutboxProcessor({
        store,
        send: (item) => submitReport(item.input, item.photos, { api, prepare: preparePhoto }, item.state),
        deleteFiles: deletePhotos,
        onSent: () => {
          queryClient.invalidateQueries({ queryKey: ['map-reports'] });
          queryClient.invalidateQueries({ queryKey: ['my-reports'] });
        },
        onChange: refresh,
      }),
    [store, api, queryClient, refresh],
  );

  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);
  const flush = useCallback(async () => (signedInRef.current ? processor.flush() : 0), [processor]);

  useEffect(() => {
    let cancelled = false;
    store
      .list()
      .then((list) => !cancelled && setItems(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!signedIn) return;
    flush();
    const net = Network.addNetworkStateListener((s) => {
      if (s.isInternetReachable !== false && s.isConnected) flush();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush();
    });
    return () => {
      net.remove();
      app.remove();
    };
  }, [signedIn, flush]);

  const enqueue = useCallback<OutboxValue['enqueue']>(
    async (uuid, input, photos, state) => {
      const kept = await persistPhotos(uuid, photos);
      await store.put(newOutboxItem(uuid, input, kept, state));
      await refresh();
    },
    [store, refresh],
  );

  const remove = useCallback(
    async (uuid: string) => {
      await store.remove(uuid);
      deletePhotos(uuid);
      await refresh();
    },
    [store, refresh],
  );

  const value = useMemo(() => ({ items, enqueue, flush, remove }), [items, enqueue, flush, remove]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxValue {
  const value = useContext(OutboxContext);
  if (!value) throw new Error('useOutbox must be used inside <OutboxProvider>');
  return value;
}
