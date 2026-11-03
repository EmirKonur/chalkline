import type { SyncProvider, SyncStatus } from '@chalkline/core/provider';
import { useSyncExternalStore } from 'react';

export function useSyncStatus(provider: SyncProvider): SyncStatus {
  return useSyncExternalStore(
    (listener) => provider.subscribe(listener),
    () => provider.getStatus(),
  );
}
