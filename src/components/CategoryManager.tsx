import { useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { CATEGORY_COLORS, CategoryColor, TargetCategory } from '@/types/category';

const COLOR_VALUES: Record<CategoryColor, string> = {
  blue: '#5b9cf5', purple: '#a184f7', green: '#48b68a', pink: '#ed76a8', orange: '#e69a4a',
  red: '#e46f6f', gray: '#9299a5', indigo: '#697ce0', yellow: '#d7ad43', slate: '#738091',
};

export function CategoryManager() {
  const categories = useAppStore(state => state.categories);
  const targets = useAppStore(state => state.urlConfigs);
  const setCategories = useAppStore(state => state.setCategories);
  const [name, setName] = useState('');
  const [color, setColor] = useState<CategoryColor>('blue');
  const [editing, setEditing] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const [error, setError] = useState('');
  const deleted = categories.find(item => item.id === deleteId);
  const usageCount = (id: string) => targets.filter(target => target.category === id).length;

  const beginEdit = (category: TargetCategory) => {
    setEditing(category.id); setName(category.name); setColor(category.color); setError(''); setDeleteId(undefined);
  };
  const cancel = () => { setEditing(undefined); setName(''); setColor('blue'); setError(''); };
  const save = () => {
    const normalizedName = name.trim();
    if (!normalizedName) { setError('请输入分类名称'); return; }
    if (normalizedName.length > 30) { setError('分类名称不能超过 30 个字符'); return; }
    if (categories.some(item => item.id !== editing && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) { setError('分类名称已存在'); return; }
    if (editing) {
      setCategories(categories.map(item => item.id === editing ? { ...item, name: normalizedName, color } : item));
    } else {
      setCategories([...categories, { id: `category_${crypto.randomUUID()}`, name: normalizedName, color }]);
    }
    cancel();
  };
  const remove = () => {
    if (!deleted || categories.length <= 1) return;
    setCategories(categories.filter(item => item.id !== deleted.id), deleted.id);
    setDeleteId(undefined);
    if (editing === deleted.id) cancel();
  };

  return <div className="category-manager">
    <div className="section-heading"><h2>分类</h2><span>{categories.length} 项</span></div>
    <div className="category-list" aria-label="目标分类">
      {categories.map(category => <div className="category-row" key={category.id}>
        {editing === category.id ? <div className="category-editor">
          <label className="category-name-field">名称<input className="input" autoFocus maxLength={30} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } if (event.key === 'Escape') cancel(); }} /></label>
          <ColorPicker value={color} onChange={setColor} />
          <div className="category-row-actions"><button className="icon-button" title="保存分类" aria-label="保存分类" onClick={save}><Check size={16} /></button><button className="icon-button" title="取消编辑" aria-label="取消编辑" onClick={cancel}><X size={16} /></button></div>
        </div> : <>
          <span className="category-swatch" style={{ backgroundColor: COLOR_VALUES[category.color] }} />
          <span className="category-row-name">{category.name}</span>
          <span className="category-usage">{usageCount(category.id)} 个目标</span>
          {deleteId === category.id ? <div className="category-delete-confirm"><span>{usageCount(category.id) ? `删除后将移至「${categories.find(item => item.id !== category.id)?.name}」` : '确定删除此分类？'}</span><button className="text-button danger-text" onClick={remove}>删除</button><button className="icon-button" aria-label="取消删除" onClick={() => setDeleteId(undefined)}><X size={15} /></button></div> : <div className="category-row-actions"><button className="icon-button" title="编辑分类" aria-label={`编辑 ${category.name}`} onClick={() => beginEdit(category)}><Pencil size={15} /></button><button className="icon-button" title={categories.length <= 1 ? '至少保留一个分类' : '删除分类'} aria-label={`删除 ${category.name}`} disabled={categories.length <= 1} onClick={() => setDeleteId(category.id)}><Trash2 size={15} /></button></div>}
        </>}
      </div>)}
    </div>
    {error && <p role="alert" className="form-error category-error">{error}</p>}
    {editing === undefined && <div className="category-create">
      <label className="category-name-field">新分类<input className="input" maxLength={30} placeholder="输入分类名称" value={name} onChange={event => { setName(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} /></label>
      <ColorPicker value={color} onChange={setColor} />
      <button className="btn btn-secondary" onClick={save}><Plus size={15} />添加分类</button>
    </div>}
    {editing && <button className="text-button" onClick={cancel}><RotateCcw size={14} />取消编辑</button>}
  </div>;
}

function ColorPicker({ value, onChange }: { value: CategoryColor; onChange: (color: CategoryColor) => void }) {
  return <div className="category-colors" role="group" aria-label="分类颜色">{CATEGORY_COLORS.map(color => <button key={color} type="button" className={`category-color ${value === color ? 'is-selected' : ''}`} aria-label={`${color}色`} aria-pressed={value === color} title={color} style={{ backgroundColor: COLOR_VALUES[color] }} onClick={() => onChange(color)}>{value === color && <Check size={12} />}</button>)}</div>;
}
