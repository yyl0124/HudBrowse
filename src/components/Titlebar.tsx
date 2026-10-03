import { useState } from 'react';
import { ArrowUpRight, CircleDot, Minus, PanelTopClose, Scan, Settings2, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { shell } from '@/services/shell';
import { reportError, toggleTarget } from '@/services/targets';
import { SelectionIndicator } from './ui/SelectionIndicator';
import { IslandTargets } from './IslandTargets';

export function Titlebar({ page, onPage, compact, onCompact }: { page: 'targets' | 'settings'; onPage: (page: 'targets' | 'settings') => void; compact: boolean; onCompact: (value: boolean) => Promise<void> }) {
  const configs = useAppStore(state => state.urlConfigs);
  const runtime = useAppStore(state => state.runtime);
  const initialized = useAppStore(state => state.initialized);
  const error = useAppStore(state => state.error);
  const [busy, setBusy] = useState(false);
  const visible = configs.filter(config => config.type !== 'scene' && runtime[config.id]?.visible);
  const action = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await operation(); } catch (error) { reportError(error); } finally { setBusy(false); }
  };
  const interactive = (target: EventTarget) => (target as HTMLElement).closest('button, input, [role="combobox"], [data-island-targets]');
  return <header className={`title-island ${compact ? 'compact-title' : ''}`} aria-label="标题栏"
    onMouseDown={event => { if (event.button === 0 && !interactive(event.target)) { event.preventDefault(); void shell.drag().catch(reportError); } }}
    onDoubleClick={event => { if (!compact && !interactive(event.target)) void shell.maximize().catch(reportError); }}>
    <div className="brand" title="拖动窗口">
      <img className="brand-icon" src="/hudbrowse-small.png" alt="" draggable={false} /><span>HudBrowse</span>
    </div>
    {compact ? <>
      <IslandTargets disabled={busy || !initialized} onToggle={id => void action(async () => { await toggleTarget(id); })} />
      <button className={`island-status ${error ? 'has-error' : ''}`} title={error || '打开工作台'} aria-label="打开工作台" disabled={busy} onClick={() => void action(() => onCompact(false))}><span className="status-dot" /><span>{error ? '异常' : visible.length}</span></button>
      <button className="icon-button" title="展开工作台" aria-label="展开工作台" disabled={busy} onClick={() => void action(() => onCompact(false))}><ArrowUpRight size={17} /></button>
      <button className="icon-button close-button" title="关闭窗口" aria-label="关闭窗口" disabled={busy} onClick={() => void action(shell.close)}><X size={16} /></button>
    </> : <>
      <nav className="island-navigation" aria-label="主导航"><SelectionIndicator value={page} /><button className={page === 'targets' ? 'is-selected' : ''} aria-current={page === 'targets' ? 'page' : undefined} onClick={() => onPage('targets')}><CircleDot size={15} />工作台</button><button className={page === 'settings' ? 'is-selected' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onPage('settings')}><Settings2 size={15} />全局设置</button></nav>
      <div className="island-controls"><button className="icon-button compact-mode-button" title="收起为灵动岛" aria-label="收起为灵动岛" disabled={busy} onClick={() => void action(() => onCompact(true))}><PanelTopClose size={16} /></button><span className="control-divider" /><button className="icon-button" title="最小化" aria-label="最小化" disabled={busy} onClick={() => void action(shell.minimize)}><Minus size={16} /></button><button className="icon-button maximize-button" title="最大化或还原" aria-label="最大化或还原" disabled={busy} onClick={() => void action(shell.maximize)}><Scan size={15} /></button><button className="icon-button close-button" title="关闭窗口" aria-label="关闭窗口" disabled={busy} onClick={() => void action(shell.close)}><X size={16} /></button></div>
    </>}
  </header>;
}
