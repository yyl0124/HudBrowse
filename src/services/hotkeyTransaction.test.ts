import { describe, expect, it, vi } from 'vitest';
import { changeShortcut } from './hotkeyTransaction';

function fixture() {
  const keys = new Set(['Alt+A']);
  const adapter = {
    register: vi.fn(async (key: string, _callback: () => void) => { if (keys.has(key)) throw new Error('occupied'); keys.add(key); }),
    unregister: vi.fn(async (key: string) => { keys.delete(key); }),
  };
  return { keys, adapter, commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}) };
}
describe('shortcut transactions', () => {
  it('re-registers a deleted shortcut if target deletion fails', async () => {
    const f = fixture(); f.commit.mockRejectedValue(new Error('delete failed'));
    await expect(changeShortcut(f.adapter, 'Alt+A', undefined, () => {}, f.commit, f.rollback)).rejects.toThrow('delete failed');
    expect([...f.keys]).toEqual(['Alt+A']);
    expect(f.adapter.register).toHaveBeenCalledWith('Alt+A', expect.any(Function));
  });
  it('keeps the old shortcut when the replacement cannot register', async () => {
    const f = fixture(); f.keys.add('Alt+B');
    await expect(changeShortcut(f.adapter, 'Alt+A', 'Alt+B', () => {}, f.commit, f.rollback)).rejects.toThrow('occupied');
    expect(f.keys.has('Alt+A')).toBe(true); expect(f.commit).not.toHaveBeenCalled();
  });
  it('rolls back persistence and removes the new key when commit fails', async () => {
    const f = fixture(); f.commit.mockRejectedValue(new Error('disk full'));
    await expect(changeShortcut(f.adapter, 'Alt+A', 'Alt+B', () => {}, f.commit, f.rollback)).rejects.toThrow('disk full');
    expect([...f.keys]).toEqual(['Alt+A']); expect(f.rollback).toHaveBeenCalledOnce();
  });
  it('does not unregister an unchanged shortcut', async () => {
    const f = fixture();
    await changeShortcut(f.adapter, 'Alt+A', 'Alt+A', () => {}, f.commit, f.rollback);
    expect(f.adapter.register).not.toHaveBeenCalled(); expect(f.adapter.unregister).not.toHaveBeenCalled();
  });
  it('replaces an old key after committing', async () => {
    const f = fixture();
    await changeShortcut(f.adapter, 'Alt+A', 'Alt+B', () => {}, f.commit, f.rollback);
    expect([...f.keys]).toEqual(['Alt+B']);
    expect(f.commit.mock.invocationCallOrder[0]).toBeLessThan(f.adapter.unregister.mock.invocationCallOrder[0]);
  });
  it('restores persistent state if removing the old key fails', async () => {
    const f = fixture(); f.adapter.unregister.mockImplementation(async key => { if (key === 'Alt+A') throw new Error('OS error'); f.keys.delete(key); });
    await expect(changeShortcut(f.adapter, 'Alt+A', 'Alt+B', () => {}, f.commit, f.rollback)).rejects.toThrow('OS error');
    expect([...f.keys]).toEqual(['Alt+A']); expect(f.rollback).toHaveBeenCalledOnce();
  });
});
