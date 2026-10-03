import { UrlConfig, WindowSettings } from '@/types/url-config';
import { GlobalConfig, DEFAULT_GLOBAL_CONFIG, DEFAULT_WINDOW_SETTINGS } from '@/types/settings';
import { pruneSceneMembers } from './scenes';
import { CATEGORY_COLORS, CategoryColor, TargetCategory } from '@/types/category';
import { DEFAULT_CATEGORIES } from './constants';

const KEYS = { targets: 'hudbrowse_url_configs', global: 'hudbrowse_global_config', categories: 'hudbrowse_categories', hotkeys: 'hudbrowse_hotkeys', runtime: 'hudbrowse_window_states' };
function backup(key: string, raw: string) {
  try { localStorage.setItem(`${key}_backup_${Date.now()}`, raw); } catch { /* Preserve startup when storage is full. */ }
}
function read(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed) {
      if (parsed.schemaVersion !== 2) throw new Error('Unsupported configuration version');
      return parsed.data;
    }
    return parsed;
  } catch { backup(key, raw); return undefined; }
}
function write(key: string, data: unknown) { localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, data })); }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function position(value: unknown): UrlConfig['lastPosition'] {
  const data = record(value);
  return typeof data.x === 'number' && Number.isFinite(data.x) && typeof data.y === 'number' && Number.isFinite(data.y) ? { x: data.x, y: data.y } : undefined;
}
function size(value: unknown): UrlConfig['lastSize'] {
  const data = record(value);
  return typeof data.width === 'number' && typeof data.height === 'number' && Number.isFinite(data.width) && Number.isFinite(data.height)
    ? { width: Math.max(1, Math.min(65535, data.width)), height: Math.max(1, Math.min(65535, data.height)) } : undefined;
}
function defaultCategories(): TargetCategory[] {
  return DEFAULT_CATEGORIES.map(item => ({ id: item.value, name: item.label, color: item.color as CategoryColor }));
}
export function normalizeSettings(value: unknown, defaults = DEFAULT_WINDOW_SETTINGS): WindowSettings {
  const data = record(value);
  const bool = (key: keyof WindowSettings) => typeof data[key] === 'boolean' ? data[key] as boolean : defaults[key] as boolean;
  const autoHideOnEdge = bool('autoHideOnEdge');
  return {
    opacity: number(data.opacity, defaults.opacity, 10, 100),
    defaultWidth: number(data.defaultWidth, defaults.defaultWidth, 200, 3840),
    defaultHeight: number(data.defaultHeight, defaults.defaultHeight, 200, 2160),
    autoHideOnEdge, hideOnMouseLeave: autoHideOnEdge ? false : bool('hideOnMouseLeave'),
    mouseThrough: bool('mouseThrough'), alwaysOnTop: bool('alwaysOnTop'),
  };
}
export function effectiveSettings(config: UrlConfig, global: GlobalConfig): WindowSettings {
  return normalizeSettings(config.settings ?? global.defaultSettings);
}
export class Storage {
  static getCategories(): TargetCategory[] {
    const value = read(KEYS.categories);
    if (value === undefined) return defaultCategories();
    if (!Array.isArray(value)) { backup(KEYS.categories, JSON.stringify(value)); return defaultCategories(); }
    const seen = new Set<string>();
    const categories = value.flatMap((item): TargetCategory[] => {
      const data = record(item);
      if (typeof data.value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.value)
        || typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 30
        || seen.has(data.value) || !CATEGORY_COLORS.includes(data.color as CategoryColor)) return [];
      seen.add(data.value);
      return [{ id: data.value, name: data.label.trim(), color: data.color as CategoryColor }];
    });
    return categories.length ? categories : defaultCategories();
  }
  static saveCategories(categories: TargetCategory[]) {
    write(KEYS.categories, categories.map(item => ({ value: item.id, label: item.name.trim(), color: item.color })));
  }
  static getUrlConfigs(): UrlConfig[] {
    const value = read(KEYS.targets);
    if (value === undefined) return [];
    if (!Array.isArray(value)) { backup(KEYS.targets, JSON.stringify(value)); return []; }
    const seen = new Set<string>();
    return pruneSceneMembers(value.flatMap((item): UrlConfig[] => {
      const data = record(item);
      if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(data.id) || data.id === 'main' || seen.has(data.id) || typeof data.name !== 'string') {
        backup(KEYS.targets, JSON.stringify(item)); return [];
      }
      seen.add(data.id);
      const info = record(data.windowInfo);
      const type = data.type === 'scene' ? 'scene' : data.type === 'window' ? 'window' : 'url';
      if (type === 'window' && (typeof info.exePath !== 'string' || typeof info.className !== 'string' || typeof info.title !== 'string' || typeof info.hwnd !== 'number' || !Number.isSafeInteger(info.hwnd) || typeof info.processId !== 'number')) return [];
      if (type === 'url') {
        try { if (!['http:', 'https:'].includes(new URL(String(data.url)).protocol)) return []; } catch { return []; }
      }
      return [{ ...data, id: data.id, name: data.name, type, url: type === 'url' ? String(data.url) : '',
        memberIds: type === 'scene' ? (Array.isArray(data.memberIds) ? data.memberIds.filter((id): id is string => typeof id === 'string') : []) : undefined,
        hotkey: typeof data.hotkey === 'string' ? data.hotkey : '',
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
        settings: type !== 'scene' && data.settings ? normalizeSettings(data.settings) : undefined,
        lastPosition: position(data.lastPosition), lastSize: size(data.lastSize),
        windowInfo: type === 'window' ? { ...info, rect: { ...position(info.rect) ?? { x: 0, y: 0 }, ...size(info.rect) ?? { width: 800, height: 600 } }, isVisible: info.isVisible ?? info.is_visible ?? false } : undefined,
        isOpen: false,
      } as UrlConfig];
    }));
  }
  static saveUrlConfigs(configs: UrlConfig[]) { write(KEYS.targets, configs.map(({ isOpen: _, ...config }) => config)); }
  static saveUrlConfig(config: UrlConfig) {
    const configs = this.getUrlConfigs();
    const index = configs.findIndex(item => item.id === config.id);
    if (index < 0) configs.push(config); else configs[index] = config;
    this.saveUrlConfigs(configs);
  }
  static deleteUrlConfig(id: string) { this.saveUrlConfigs(this.getUrlConfigs().filter(config => config.id !== id)); }
  static getGlobalConfig(): GlobalConfig {
    const data = record(read(KEYS.global));
    return { ...DEFAULT_GLOBAL_CONFIG, theme: data.theme === 'light' ? 'light' : 'dark',
      defaultSettings: normalizeSettings(data.defaultSettings),
      autoStartOnBoot: typeof data.autoStartOnBoot === 'boolean' ? data.autoStartOnBoot : false,
      showInTray: typeof data.showInTray === 'boolean' ? data.showInTray : true,
      closeToTray: typeof data.closeToTray === 'boolean' ? data.closeToTray : true,
      restoreLastSession: typeof data.restoreLastSession === 'boolean' ? data.restoreLastSession : true,
    };
  }
  static saveGlobalConfig(config: GlobalConfig) { write(KEYS.global, config); }
  static getHotkeys() { return new Map(this.getUrlConfigs().filter(config => config.hotkey).map(config => [config.id, config.hotkey])); }
  static saveHotkeys(hotkeys: Map<string, string>) { write(KEYS.hotkeys, [...hotkeys]); }
  static getWindowStates(): Record<string, unknown> { return record(read(KEYS.runtime)); }
  static getWindowState(id: string) { return this.getWindowStates()[id]; }
  static saveWindowState(id: string, state: unknown) { write(KEYS.runtime, { ...this.getWindowStates(), [id]: state }); }
  static clearAll() { Object.values(KEYS).forEach(key => localStorage.removeItem(key)); }
}
