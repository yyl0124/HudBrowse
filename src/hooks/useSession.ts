import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { refreshTargets, reportError } from '@/services/targets';
import { useAppStore } from '@/store/appStore';

export function useSessionSave() {
  const initialized = useAppStore(state => state.initialized);
  useEffect(() => {
    if (!initialized) return;
    let disposed = false;
    let busy = false;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      if (busy || disposed) return;
      busy = true;
      try { await refreshTargets(); } catch (error) { if (!disposed) reportError(error); }
      finally { busy = false; }
    };
    // Native desktop applications can change independently of this application's commands.
    const interval = setInterval(refresh, 2000);
    void listen('target-state-changed', refresh).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(reportError);
    return () => { disposed = true; clearInterval(interval); unlisten?.(); };
  }, [initialized]);
}
