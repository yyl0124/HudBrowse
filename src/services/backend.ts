import { invoke } from '@tauri-apps/api/tauri';
import { TargetState, UrlConfig, WindowInfo } from '@/types/url-config';

export const backend = {
  syncTargets: (configs: UrlConfig[]) => invoke<void>('sync_targets', { configs }),
  resolveTarget: (config: UrlConfig) => invoke<UrlConfig>('resolve_target', { config }),
  toggle: (config: UrlConfig) => invoke<TargetState>('toggle_target', { config }),
  show: (config: UrlConfig) => invoke<TargetState>('show_target', { config }),
  hide: (id: string) => invoke<TargetState>('hide_target', { id }),
  apply: (config: UrlConfig) => invoke<TargetState>('apply_target_settings', { config }),
  remove: (id: string) => invoke<void>('remove_target', { id }),
  states: () => invoke<TargetState[]>('get_target_states'),
  saveSession: () => invoke<void>('save_session'),
  loadSession: () => invoke<TargetState[]>('load_session'),
  enumerate: () => invoke<WindowInfo[]>('enumerate_windows'),
  autoStart: (enable: boolean) => invoke<void>('set_auto_start', { enable }),
  getAutoStart: () => invoke<boolean>('get_auto_start'),
  tray: (visible: boolean) => invoke<void>('set_tray_visibility', { visible }),
  closeToTray: (enabled: boolean) => invoke<void>('set_close_to_tray', { enabled }),
  pageAction: (id: string, action: 'refresh' | 'back' | 'forward' | 'clear_cache' | 'clear_cookies') => invoke<void>('page_action', { id, action }),
};
