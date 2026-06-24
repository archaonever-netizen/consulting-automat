import { useMemo, useState, type ReactNode } from 'react';

// Карточка с локальным черновиком: ввод в поля не трогает родительское состояние
// (нет ре-рендера всего канваса и записи в localStorage на каждый символ) — данные
// поднимаются наверх и сохраняются только по кнопке «Применить».
export default function DraftCard<T extends { id: number }>({
  card,
  title,
  onApply,
  children,
  focusId,
}: {
  card: T;
  title: ReactNode;
  onApply: (next: T) => void;
  children: (draft: T, patch: (value: Partial<T>) => void) => ReactNode;
  // Якорь для центрирования при переходе с графа «Весь проект» (data-focus-id).
  focusId?: string;
}) {
  const [draft, setDraft] = useState<T>(card);
  const [committed, setCommitted] = useState<T>(card);

  // Resync the draft when the committed card changes from outside (e.g. after Apply
  // recomputes a derived field). Adjusting state during render is the recommended
  // alternative to a setState-in-effect for this case.
  if (committed !== card) {
    setCommitted(card);
    setDraft(card);
  }

  const dirty = useMemo(
    () => (Object.keys(card) as Array<keyof T>).some(key => card[key] !== draft[key]),
    [card, draft],
  );

  const patch = (value: Partial<T>) => setDraft(current => ({ ...current, ...value }) as T);

  return (
    <div className="project-theory-card" data-focus-id={focusId}>
      <div className="project-theory-card-head">
        <div className="project-theory-card-title">{title}</div>
        <span className={`project-theory-status-badge${dirty ? ' is-draft' : ''}`}>
          {dirty ? 'Черновик' : 'Применено'}
        </span>
      </div>
      {children(draft, patch)}
      <div className="project-theory-card-foot">
        <button className="btn btn-soft btn-sm" type="button" disabled={!dirty} onClick={() => setDraft(card)}>
          Сбросить
        </button>
        <button className="btn btn-primary btn-sm" type="button" disabled={!dirty} onClick={() => onApply(draft)}>
          Применить
        </button>
      </div>
    </div>
  );
}
