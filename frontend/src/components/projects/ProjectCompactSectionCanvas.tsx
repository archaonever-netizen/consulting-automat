import { useMemo } from 'react';
import Icon from '../Icon';
import { buildCompactSectionModel } from './projectCompactSectionModel';

interface ProjectCompactSectionCanvasProps {
  projectId: number;
  cardId: string;
}

const statusLabel = {
  empty: 'не заполнен',
  partial: 'заполнен частично',
  filled: 'заполнен',
};

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ProjectCompactSectionCanvas({ projectId, cardId }: ProjectCompactSectionCanvasProps) {
  const model = useMemo(() => buildCompactSectionModel(projectId, cardId), [projectId, cardId]);

  if (!model) {
    return (
      <div className="project-compact-section">
        <div className="project-canvas-empty">
          <div className="ei"><Icon name="book" size={24} /></div>
          <b>Компазированный раздел недоступен</b>
          <span>Для этого экрана пока нет read-only модели данных.</span>
        </div>
      </div>
    );
  }

  const updatedAt = formatDate(model.updatedAt);
  const hasContent = model.fields.length > 0 || model.groups.length > 0;

  return (
    <div className="project-compact-section">
      <section className="project-compact-hero">
        <div>
          <p className="eyebrow">Компазированный раздел</p>
          <h2>{model.title}</h2>
          {model.description && <p>{model.description}</p>}
        </div>
        <div className="project-compact-status">
          <span>{statusLabel[model.summary.status]}</span>
          <b>{model.summary.filledFields}/{model.summary.totalFields || 0}</b>
          <small>заполненных полей</small>
        </div>
      </section>

      <section className="project-compact-meta" aria-label="Состояние раздела">
        <span>{model.summary.filledItems}/{model.summary.totalItems || 0} элементов с данными</span>
        <span>только просмотр</span>
        {updatedAt && <span>обновлено {updatedAt}</span>}
      </section>

      {!hasContent ? (
        <section className="project-compact-empty">
          <div className="ei"><Icon name="template" size={22} /></div>
          <b>В разделе пока нет внесенной информации</b>
          <span>Когда рабочая карточка будет заполнена, здесь появится собранная версия без полей редактирования.</span>
        </section>
      ) : (
        <>
          {model.fields.length > 0 && (
            <section className="project-compact-block">
              <h3>Ключевые поля</h3>
              <dl className="project-compact-fields">
                {model.fields.map(field => (
                  <div className="project-compact-field" key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {model.groups.map(group => (
            <section className="project-compact-block" key={group.title}>
              <h3>{group.title}</h3>
              <div className="project-compact-items">
                {group.items.map(item => (
                  <article className="project-compact-item" key={`${group.title}:${item.id}`}>
                    <h4>{item.title}</h4>
                    <dl className="project-compact-fields">
                      {item.fields.map(field => (
                        <div className="project-compact-field" key={`${item.id}:${field.label}`}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
