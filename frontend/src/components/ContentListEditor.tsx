import Icon from './Icon';

export interface ContentItem {
  title: string;
  note?: string | null;
}

interface Props {
  label: string;
  hint?: string;
  items: ContentItem[];
  onChange: (items: ContentItem[]) => void;
}

/** Редактируемый список пунктов {title, note} — фреймворки, фичи, регламенты и т.п. */
export default function ContentListEditor({ label, hint, items, onChange }: Props) {
  function update(i: number, patch: Partial<ContentItem>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { title: '', note: '' }]);
  }

  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="sc-head">
        <div className="sc-title">{label}</div>
        {hint && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{hint}</p>}
      </div>

      {items.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>Пока пусто</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                className="form-input"
                placeholder="Название"
                value={it.title}
                onChange={e => update(i, { title: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="Примечание (опционально)"
                value={it.note ?? ''}
                onChange={e => update(i, { note: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => remove(i)}
              title="Удалить пункт"
              style={{ flexShrink: 0 }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-soft" onClick={add}>
          <Icon name="plus" size={16} />Добавить
        </button>
      </div>
    </div>
  );
}
