import { CSSProperties } from 'react';

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, showValue = true, unit = '%' }: { label?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; showValue?: boolean; unit?: string }) {
  return <div className="slider-control"><div className="slider-heading"><span>{label}</span>{showValue && <output>{value}<small>{unit}</small></output>}</div><input type="range" aria-label={label || '数值'} min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} style={{ '--range-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} /></div>;
}
