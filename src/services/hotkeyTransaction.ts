export interface ShortcutAdapter {
  register: (hotkey: string, callback: () => void) => Promise<void>;
  unregister: (hotkey: string) => Promise<void>;
}

// Persist only after the new shortcut is registered; compensate every completed step on failure.
export async function changeShortcut(
  adapter: ShortcutAdapter,
  oldKey: string | undefined,
  newKey: string | undefined,
  callback: () => void,
  commit: () => Promise<void>,
  rollback: () => Promise<void>,
) {
  let added = false;
  let removed = false;
  let committing = false;
  try {
    if (!newKey && oldKey) { await adapter.unregister(oldKey); removed = true; }
    if (newKey && newKey !== oldKey) { await adapter.register(newKey, callback); added = true; }
    committing = true;
    await commit();
    if (oldKey && newKey && oldKey !== newKey) { await adapter.unregister(oldKey); removed = true; }
  } catch (error) {
    const failures: string[] = [];
    if (committing) { try { await rollback(); } catch (e) { failures.push(String(e)); } }
    if (added) { try { await adapter.unregister(newKey!); } catch (e) { failures.push(String(e)); } }
    if (removed) { try { await adapter.register(oldKey!, callback); } catch (e) { failures.push(String(e)); } }
    throw new Error(`${String(error)}${failures.length ? `; rollback: ${failures.join('; ')}` : ''}`);
  }
}
