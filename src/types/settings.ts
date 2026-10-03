import { WindowSettings } from './url-config';

export interface GlobalConfig {
  theme: 'light' | 'dark';
  defaultSettings: WindowSettings;
  autoStartOnBoot: boolean;
  showInTray: boolean;
  closeToTray: boolean;
  restoreLastSession: boolean;
}

export const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  opacity: 100,
  hideOnMouseLeave: false,
  mouseThrough: false,
  autoHideOnEdge: false,
  alwaysOnTop: true,
  defaultWidth: 800,
  defaultHeight: 600,
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  theme: 'dark',
  defaultSettings: DEFAULT_WINDOW_SETTINGS,
  autoStartOnBoot: false,
  showInTray: true,
  closeToTray: true,
  restoreLastSession: true,
};

