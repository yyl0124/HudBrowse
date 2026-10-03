import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Grip, LoaderCircle, X } from 'lucide-react';
import { useContentMotion } from './hooks/useContentMotion';
import { UrlManager } from './pages/UrlManager';
import { Settings } from './pages/Settings';
import { useAppStore } from './store/appStore';
import { applyDefaults, initializeApp, reportError } from './services/targets';
import { isDesktop, shell } from './services/shell';
import { useSessionSave } from './hooks/useSession';
import { Titlebar } from './components/Titlebar';
import { ShellOutline } from './components/ShellOutline';
import { useCompactMotion } from './hooks/useCompactMotion';


function App() {
  const [page, setPage] = useState<'targets' | 'settings'>('targets');
  const [compact, setCompact] = useState(false);
  const config = useAppStore(state => state.config);
  const error = useAppStore(state => state.error);
  const initialized = useAppStore(state => state.initialized);
  const previous = useRef(config.defaultSettings);
  const container = useRef<HTMLDivElement>(null);
  useSessionSave();
  useEffect(() => {
    document.documentElement.classList.toggle('native-desktop', isDesktop());
    void shell.getCompact().then(setCompact).catch(reportError);
    if (isDesktop()) void initializeApp().catch(reportError);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', config.theme === 'dark'); }, [config.theme]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (initialized && previous.current !== config.defaultSettings) timer = setTimeout(() => { void applyDefaults().catch(reportError); }, 180);
    previous.current = config.defaultSettings;
    return () => clearTimeout(timer);
  }, [config.defaultSettings, initialized]);
  useContentMotion(container, `${page}:${compact}`, '.page-content:not([hidden]) .workspace-heading, .page-content:not([hidden]) .workbench');
  const changeCompact = useCompactMotion(container, setCompact);
  return <div ref={container} className={`desktop-shell ${compact ? 'is-compact' : ''}`}>
    <ShellOutline compact={compact} />
    <Titlebar page={page} onPage={setPage} compact={compact} onCompact={changeCompact} />
    <main className="workspace-surface" hidden={compact}>
      {!isDesktop() && <div className="preview-notice"><CirclePreview />浏览器预览<span>桌面功能未连接</span></div>}
      {error && <div role="alert" className="error-banner"><AlertCircle size={16} /><span>{error}</span>{!initialized && <button className="text-button" onClick={() => void initializeApp().catch(reportError)}>重试<ArrowUpRight size={14} /></button>}<button className="icon-button" aria-label="关闭错误提示" title="关闭错误提示" onClick={() => useAppStore.setState({ error: undefined })}><X size={16} /></button></div>}
      {isDesktop() && !initialized && !error && <div role="status" className="initialization-status"><LoaderCircle size={15} className="is-spinning" />正在连接桌面服务</div>}
      <div className="page-content" hidden={page !== 'targets'}><UrlManager /></div>
      {page === 'settings' && <div className="page-content settings-page"><Settings /></div>}
      <footer className="workspace-footer"><span><span className={`status-dot ${initialized ? '' : 'is-muted'}`} />{initialized ? '本地服务已连接' : '桌面服务未连接'}</span><span className="footer-right">HudBrowse<span className="footer-version">1.0.18</span></span></footer>
      <button className="resize-grip" title="拖动调整窗口大小" aria-label="调整窗口大小" onMouseDown={event => { if (event.button === 0) { event.preventDefault(); void shell.resize().catch(reportError); } }}><Grip size={13} /></button>
    </main>
  </div>;
}
function CirclePreview() { return <span className="status-dot is-muted" />; }
export default App;
