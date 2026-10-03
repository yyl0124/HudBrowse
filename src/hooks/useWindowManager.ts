import { applyTarget, toggleTarget } from '@/services/targets';
export function useWindowManager() {
  return { toggleWindow: toggleTarget, reloadCapturedWindowConfig: (config: { id: string }) => applyTarget(config.id) };
}
