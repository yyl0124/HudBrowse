import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
const { useAppStore } = await import('./appStore');

describe('category lifecycle', () => {
  beforeEach(() => {
    useAppStore.setState({
      urlConfigs: [
        { id: 'a', type: 'url', name: 'A', url: 'https://a.example', hotkey: '', category: 'old', createdAt: 1, updatedAt: 1 },
        { id: 'b', type: 'url', name: 'B', url: 'https://b.example', hotkey: '', category: 'keep', createdAt: 1, updatedAt: 1 },
      ],
    });
  });

  it('moves targets out of a removed category to the first remaining category', () => {
    useAppStore.getState().setCategories([
      { id: 'keep', name: '保留', color: 'green' },
      { id: 'other', name: '其他', color: 'gray' },
    ], 'old');
    expect(useAppStore.getState().urlConfigs.map(config => config.category)).toEqual(['keep', 'keep']);
  });
});
