import { useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { UrlConfig } from '@/types/url-config';
import { useAppStore } from '@/store/appStore';
import { useSettings } from '@/hooks/useSettings';
import { checkConflict, saveTarget } from '@/services/targets';
import { normalizeUrl } from '@/utils/validators';
import { Modal } from './Modal';
import { WindowOptions } from './WindowOptions';
import { Toggle } from './ui/Toggle';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { HotkeyField } from './HotkeyField';

export function AddUrlDialog({ editingUrl, onClose }: { editingUrl: UrlConfig | null; onClose: () => void }) {
  const { config } = useSettings();
  const categories = useAppStore(state => state.categories);
  const [name, setName] = useState(editingUrl?.name ?? '');
  const [url, setUrl] = useState(editingUrl?.url ?? '');
  const [hotkey, setHotkey] = useState(editingUrl?.hotkey ?? '');
  const [category, setCategory] = useState(editingUrl?.category ?? 'other');
  const [custom, setCustom] = useState(!!editingUrl?.settings);
  const [settings, setSettings] = useState(editingUrl?.settings ?? { ...config.defaultSettings });
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isWindow = editingUrl?.type === 'window';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      if (!name.trim()) throw new Error('请输入名称');
      if (hotkey && checkConflict(hotkey, editingUrl?.id)) throw new Error('快捷键已被占用');
      setBusy(true);
      await saveTarget({ ...editingUrl, id: editingUrl?.id ?? `url_${crypto.randomUUID()}`, type: isWindow ? 'window' : 'url', name: name.trim(), url: isWindow ? '' : normalizeUrl(url), hotkey: hotkey.trim(), category, settings: custom ? settings : undefined, createdAt: editingUrl?.createdAt ?? Date.now(), updatedAt: Date.now() });
      onClose();
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  return <Modal title={isWindow ? '桌面窗口配置' : editingUrl ? '编辑网址' : '添加网址'} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="target-form"><fieldset disabled={busy} className="form-fields"><div className="form-two-columns"><label className="field-label">名称<input className="input" required autoComplete="off" value={name} placeholder="给这个目标取个名字" onChange={event => setName(event.target.value)} /></label><div className="field-label">分类<Select label="分类" className="input" value={categories.some(item => item.id === category) ? category : categories[0]?.id ?? ''} options={categories.map(item => ({ value: item.id, label: item.name }))} onChange={setCategory} /></div></div>
      {isWindow ? <div className="captured-application"><span className="eyebrow">程序位置</span><p>{editingUrl?.windowInfo?.exePath}</p></div> : <label className="field-label">网址<input className="input url-input" required autoComplete="url" value={url} placeholder="https://example.com" onChange={event => setUrl(event.target.value)} /></label>}
      <HotkeyField value={hotkey} onChange={setHotkey} onError={setError} onRecording={setRecording} />
      <div className="configuration-mode"><Toggle icon={<SlidersHorizontal size={18} />} label="使用独立设置" checked={custom} onChange={checked => { if (checked && !custom && !editingUrl?.settings) setSettings({ ...config.defaultSettings }); setCustom(checked); }} /></div>{custom ? <WindowOptions value={settings} onChange={setSettings} /> : <div className="inherit-label"><span className="status-dot" />全局默认<span>{config.defaultSettings.opacity}% · {config.defaultSettings.defaultWidth} × {config.defaultSettings.defaultHeight}</span></div>}
      </fieldset>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy || recording}><Check size={15} />{busy ? '保存中' : '保存'}</Button></div>
    </form>
  </Modal>;
}
