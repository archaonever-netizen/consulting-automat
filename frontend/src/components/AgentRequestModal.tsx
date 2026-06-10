import { useState } from 'react';
import Icon from './Icon';

export interface LinkRequest {
  type: 'request';
  kind: 'create_link';
  function: string;
  function_id: number;
  relation_type: 'executor' | 'consumer' | 'supplier';
  candidates: { id: number; name: string }[];
  suggested_id: number | null;
  suggested_name: string | null;
}

const RELATION_NOUN: Record<LinkRequest['relation_type'], string> = {
  executor: 'исполнителя',
  consumer: 'потребителя',
  supplier: 'поставщика',
};

interface Props {
  request: LinkRequest;
  index: number;
  total: number;
  onAssign: (departmentId: number) => void;
  onSkip: () => void;
}

/** Узловой вопрос ИИ: у функции нет исполнителя — назначить отдел и продолжить. */
export default function AgentRequestModal({ request, index, total, onAssign, onSkip }: Props) {
  const [deptId, setDeptId] = useState<string>(
    request.suggested_id != null ? String(request.suggested_id) : ''
  );

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="orch-spinner" style={{ position: 'static' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Вопрос от сети агентов{total > 1 ? ` · ${index + 1}/${total}` : ''}
          </span>
        </div>

        <h3 className="modal-title" style={{ marginBottom: 8 }}>
          Функции «{request.function}» не хватает {RELATION_NOUN[request.relation_type]}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
          Чтобы сеть могла выполнить эту функцию, нужно назначить отдел-исполнитель.
          {request.suggested_name && (
            <> Предлагаю <b>«{request.suggested_name}»</b> — можно согласиться или выбрать другой.</>
          )}
        </p>

        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Отдел-исполнитель</label>
          <select className="form-input" value={deptId} onChange={e => setDeptId(e.target.value)} autoFocus>
            <option value="">Выберите отдел...</option>
            {request.candidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.id === request.suggested_id ? ' — рекомендую' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onSkip}>Пропустить</button>
          <button className="btn btn-primary" disabled={!deptId} onClick={() => onAssign(Number(deptId))}>
            <Icon name="check" size={16} />Назначить и продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
