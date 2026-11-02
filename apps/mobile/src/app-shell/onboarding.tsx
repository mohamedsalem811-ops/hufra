import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { secureStore, type KeyValueStore } from '@/storage/secure';

const ONBOARDED_KEY = 'hufra.onboarded';

export async function loadOnboarded(store: KeyValueStore): Promise<boolean> {
  return (await store.get(ONBOARDED_KEY).catch(() => null)) === '1';
}

export function saveOnboarded(store: KeyValueStore): Promise<void> {
  return store.set(ONBOARDED_KEY, '1');
}

interface OnboardingValue {
  onboarded: boolean;
  /** Marks first run as done; the router then swaps onboarding for the tabs. */
  complete: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ initial, children }: { initial: boolean; children: ReactNode }) {
  const [onboarded, setOnboarded] = useState(initial);
  const complete = useCallback(async () => {
    await saveOnboarded(secureStore).catch(() => {});
    setOnboarded(true);
  }, []);
  return <OnboardingContext.Provider value={{ onboarded, complete }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return value;
}
