import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Storage } from './storage';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  });
});

describe('configuration recovery', () => {
  it('provides normalized default categories and round-trips custom categories', () => {
    const defaults = Storage.getCategories();
    expect(defaults[0]).toMatchObject({ id: 'social', name: '社交', color: 'blue' });
    Storage.saveCategories([{ id: 'focus', name: '专注', color: 'green' }]);
    expect(Storage.getCategories()).toEqual([{ id: 'focus', name: '专注', color: 'green' }]);
  });
  it('ignores malformed category entries and falls back when none are valid', () => {
    memory.set('hudbrowse_categories', JSON.stringify([{ value: 'ok', label: '有效', color: 'blue' }, { value: 'ok', label: '重复', color: 'red' }, { value: 'bad id', label: '无效', color: 'blue' }]));
    expect(Storage.getCategories()).toEqual([{ id: 'ok', name: '有效', color: 'blue' }]);
    memory.set('hudbrowse_categories', JSON.stringify([{ value: 'bad', label: '', color: 'blue' }]));
    expect(Storage.getCategories().length).toBeGreaterThan(1);
  });
  it('keeps physical 4K geometry and negative monitor positions', () => {
    memory.set('hudbrowse_url_configs', JSON.stringify([{ id: 'web_4k', name: '4K', url: 'https://example.com', hotkey: '', lastPosition: { x: -4000, y: -100 }, lastSize: { width: 5000, height: 3000 } }]));
    expect(Storage.getUrlConfigs()[0].lastSize).toEqual({ width: 5000, height: 3000 });
    expect(Storage.getUrlConfigs()[0].lastPosition?.x).toBe(-4000);
  });
  it('discards invalid geometry without discarding a valid target', () => {
    memory.set('hudbrowse_url_configs', JSON.stringify([{ id: 'web_bad_geometry', name: 'Web', url: 'https://example.com', lastPosition: { x: 'bad', y: 0 } }]));
    expect(Storage.getUrlConfigs()[0].lastPosition).toBeUndefined();
  });
  it('recovers malformed configuration without preventing startup', () => {
    memory.set('hudbrowse_url_configs', '{broken');
    expect(Storage.getUrlConfigs()).toEqual([]);
    expect([...memory.keys()].some(key => key.includes('backup'))).toBe(true);
  });
  it('merges missing global fields from defaults', () => {
    memory.set('hudbrowse_global_config', JSON.stringify({ theme: 'light', defaultSettings: { opacity: 65 } }));
    expect(Storage.getGlobalConfig().defaultSettings.defaultWidth).toBe(800);
    expect(Storage.getGlobalConfig().defaultSettings.opacity).toBe(65);
    expect(Storage.getGlobalConfig().closeToTray).toBe(true);
  });
  it('preserves an explicit exit-on-close preference', () => {
    Storage.saveGlobalConfig({ ...Storage.getGlobalConfig(), closeToTray: false });
    expect(Storage.getGlobalConfig().closeToTray).toBe(false);
  });
  it('rejects non-array target data', () => {
    memory.set('hudbrowse_url_configs', JSON.stringify({ wrong: true }));
    expect(Storage.getUrlConfigs()).toEqual([]);
  });
});


it('round-trips scenes with ordered references and removes invalid or nested members', () => {
  memory.set('hudbrowse_url_configs', JSON.stringify([
    { id: 'scene', name: '工作', type: 'scene', memberIds: ['b', 'missing', 'a', 'b', 'scene', 'nested', 42] },
    { id: 'a', name: 'A', url: 'https://a.example' },
    { id: 'b', name: 'B', url: 'https://b.example' },
    { id: 'nested', name: '空场景', type: 'scene' },
  ]));
  const configs = Storage.getUrlConfigs();
  expect(configs).toHaveLength(4);
  expect(configs[0]).toMatchObject({ type: 'scene', url: '', memberIds: ['b', 'a'] });
  expect(configs[3].memberIds).toEqual([]);
  Storage.saveUrlConfigs(configs);
  expect(Storage.getUrlConfigs()[0].memberIds).toEqual(['b', 'a']);
});
