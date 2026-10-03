import { useAppStore } from '@/store/appStore';
export function useUrlManager() {
  const urlConfigs = useAppStore(state => state.urlConfigs);
  return { urlConfigs, isLoading: false,
    saveUrlConfig: useAppStore(state => state.commitTarget),
    deleteUrlConfig: useAppStore(state => state.removeTarget),
    getUrlConfig: (id: string) => urlConfigs.find(config => config.id === id),
  };
}
