import { useEffect, useState } from 'react';
import { AppWindow, ArrowUpRight, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { backend } from '@/services/backend';
import { WindowInfo } from '@/types/url-config';
import { Modal } from './Modal';
import { TargetIcon } from './TargetIcon';

export function WindowCapture({ onCapture, onCancel }: { onCapture: (info: WindowInfo) => void; onCancel: () => void }) {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setWindows(await backend.enumerate()); } catch (error) { setError(String(error)); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const query = filter.toLowerCase();
  const list = windows.filter(info => info.title.toLowerCase().includes(query) || info.exePath.toLowerCase().includes(query));
  return <Modal title="选择桌面窗口" onClose={onCancel}><div className="capture-search"><label className="search-field"><Search size={16} /><input aria-label="搜索窗口" placeholder="搜索窗口或程序" value={filter} onChange={event => setFilter(event.target.value)} /></label><button className="icon-button" disabled={loading} title="刷新列表" aria-label="刷新列表" onClick={() => void load()}><RefreshCw size={17} className={loading ? 'is-spinning' : ''} /></button></div>
    {error && <p role="alert" className="form-error">{error}</p>}{loading ? <div role="status" className="capture-loading"><LoaderCircle size={20} className="is-spinning" />正在加载窗口</div> : <div className="capture-list">{!list.length && <div className="capture-loading"><AppWindow size={24} />没有匹配的窗口</div>}{list.map(info => <button key={info.hwnd} className="capture-item" onClick={() => onCapture(info)}><TargetIcon config={{ type: 'window', name: info.title, url: '', windowInfo: info }} small /><span className="capture-information"><strong>{info.title}</strong><span title={info.exePath}>{info.exePath}</span><small>{info.rect.width} × {info.rect.height}</small></span><ArrowUpRight size={17} /></button>)}</div>}<div className="capture-count"><span>{list.length} 个可选窗口</span></div>
  </Modal>;
}
