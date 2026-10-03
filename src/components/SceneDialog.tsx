import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { UrlConfig } from '@/types/url-config';
import { useAppStore } from '@/store/appStore';
import { saveTarget } from '@/services/targets';
import { sceneMembers } from '@/utils/scenes';
import { Modal } from './Modal';
import { TargetIcon } from './TargetIcon';
import { HotkeyField } from './HotkeyField';
import { Button } from './ui/Button';
import { Select } from './ui/Select';

export function SceneDialog({ scene, onClose }: { scene: UrlConfig | null; onClose: () => void }) {
  const configs = useAppStore(state => state.urlConfigs);
  const categories = useAppStore(state => state.categories);
  const [name, setName] = useState(scene?.name ?? '');
  const [hotkey, setHotkey] = useState(scene?.hotkey ?? '');
  const [category, setCategory] = useState(scene?.category ?? 'other');
  const [memberIds, setMemberIds] = useState(scene?.memberIds ?? []);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const members = sceneMembers({ memberIds }, configs);
  const choices = configs.filter(item => item.type !== 'scene' && `${item.name} ${item.url} ${item.windowInfo?.exePath ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const select = (id: string) => setMemberIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  return <Modal title={scene ? '编辑场景' : '添加场景'} onClose={onClose} busy={busy}>
    <form className="target-form scene-form" onSubmit={async event => {
      event.preventDefault(); setError('');
      if (!name.trim()) { setError('请输入场景名称'); return; }
      setBusy(true);
      try {
        await saveTarget({ id: scene?.id ?? `scene_${crypto.randomUUID()}`, type: 'scene', url: '', name: name.trim(), hotkey: hotkey.trim(), category, memberIds, createdAt: scene?.createdAt ?? Date.now(), updatedAt: Date.now() });
        onClose();
      } catch (error) { setError(String(error)); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="form-fields">
        <div className="form-two-columns"><label className="field-label">名称<input className="input" required value={name} placeholder="例如：专注办公" onChange={event => setName(event.target.value)} /></label><div className="field-label">分类<Select label="分类" className="input" value={categories.some(item => item.id === category) ? category : categories[0]?.id ?? ''} options={categories.map(item => ({ value: item.id, label: item.name }))} onChange={setCategory} /></div></div>
        <HotkeyField value={hotkey} onChange={setHotkey} onError={setError} onRecording={setRecording} />
        <div className="scene-selection-heading"><span>选择目标</span><span aria-live="polite">已选 {members.length} 个</span></div>
        <label className="search-field scene-search"><Search size={15} /><input aria-label="搜索场景成员" value={query} placeholder="搜索已添加的窗口或网址" onChange={event => setQuery(event.target.value)} /></label>
        <div className="scene-choices" role="group" aria-label="选择场景成员">
          {choices.map(item => { const index = memberIds.indexOf(item.id); return <label key={item.id} className={`scene-choice ${index >= 0 ? 'is-selected' : ''}`}>
            <input type="checkbox" checked={index >= 0} onChange={() => select(item.id)} aria-label={item.name} />
            <span className="scene-choice-order" aria-hidden="true">{index >= 0 ? index + 1 : <span className="scene-unchecked" />}</span><TargetIcon config={item} /><span className="scene-choice-name"><strong>{item.name}</strong><small>{item.type === 'window' ? '桌面窗口' : '网址浮窗'}</small></span>
          </label>; })}
          {!choices.length && <p className="scene-empty">{configs.some(item => item.type !== 'scene') ? '没有匹配的目标' : '先添加网址或捕获窗口，再来组合场景。'}</p>}
        </div>
        {!!members.length && <div className="scene-sequence" aria-label="启动顺序"><span>启动顺序</span><ol>{members.map((item, index) => <li key={item.id}><span>{index + 1}</span>{item.name}</li>)}</ol><small>取消后重新勾选，可将目标放到队尾。</small></div>}
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy || recording || !members.length}><Check size={15} />{busy ? '保存中' : '保存场景'}</Button></div>
    </form>
  </Modal>;
}
