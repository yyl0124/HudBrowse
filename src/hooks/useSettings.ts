import { useAppStore } from '@/store/appStore';
import { DEFAULT_GLOBAL_CONFIG } from '@/types/settings';
export function useSettings() {
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  return { config, updateConfig,
    toggleTheme: () => updateConfig({ theme: config.theme === 'dark' ? 'light' : 'dark' }),
    resetToDefault: () => updateConfig(structuredClone(DEFAULT_GLOBAL_CONFIG)),
  };
}
