import { create } from 'zustand';
import { GlobalConfig } from '@/types/settings';
import { TargetState, UrlConfig } from '@/types/url-config';
import { Storage, normalizeSettings } from '@/utils/storage';
import { pruneSceneMembers, withSceneStates } from '@/utils/scenes';
import { TargetCategory } from '@/types/category';

interface AppState {
  urlConfigs: UrlConfig[];
  categories: TargetCategory[];
  config: GlobalConfig;
  runtime: Record<string, TargetState>;
  hotkeyErrors: Record<string, string>;
  initialized: boolean;
  error?: string;
  commitTarget: (config: UrlConfig) => void;
  removeTarget: (id: string) => void;
  reorderTargets: (source: string, destination: string) => void;
  updateConfig: (updates: Partial<GlobalConfig>) => void;
  setRuntime: (states: TargetState[]) => void;
  setCategories: (categories: TargetCategory[], removedId?: string) => void;
}
export const useAppStore = create<AppState>((set, get) => ({
  urlConfigs: Storage.getUrlConfigs(), categories: Storage.getCategories(), config: Storage.getGlobalConfig(),
  runtime: {}, hotkeyErrors: {}, initialized: false,
  commitTarget(config) {
    const next = [...get().urlConfigs];
    const index = next.findIndex(item => item.id === config.id);
    if (index < 0) next.push(config); else next[index] = config;
    Storage.saveUrlConfigs(next);
    set({ urlConfigs: next, runtime: withSceneStates(next, get().runtime) });
  },
  removeTarget(id) {
    const next = pruneSceneMembers(get().urlConfigs.filter(item => item.id !== id));
    Storage.saveUrlConfigs(next);
    const runtime = { ...get().runtime };
    delete runtime[id];
    set({ urlConfigs: next, runtime: withSceneStates(next, runtime) });
  },
  reorderTargets(source, destination) {
    const next = [...get().urlConfigs];
    const from = next.findIndex(item => item.id === source);
    const to = next.findIndex(item => item.id === destination);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    Storage.saveUrlConfigs(next);
    set({ urlConfigs: next });
  },
  updateConfig(updates) {
    const next = { ...get().config, ...updates };
    if (updates.defaultSettings) next.defaultSettings = normalizeSettings(updates.defaultSettings);
    Storage.saveGlobalConfig(next);
    set({ config: next });
  },
  setCategories(categories, removedId) {
    if (!categories.length) return;
    const fallback = categories[0].id;
    const next = removedId
      ? get().urlConfigs.map(config => config.category === removedId ? { ...config, category: fallback } : config)
      : get().urlConfigs;
    Storage.saveCategories(categories);
    if (next !== get().urlConfigs) Storage.saveUrlConfigs(next);
    set({ categories, urlConfigs: next });
  },
  setRuntime(states) { set({ runtime: withSceneStates(get().urlConfigs, Object.fromEntries(states.map(state => [state.id, state]))) }); },
}));
