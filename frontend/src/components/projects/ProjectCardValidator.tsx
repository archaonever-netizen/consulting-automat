import { useEffect, useState } from 'react';
import axios from 'axios';
import Icon from '../Icon';
import api from '../../services/api';
import { buildCardValidationText } from './projectCardValidation';
import {
  readValidationCache,
  writeValidationCache,
  type EvidenceRef,
  type ValidationResult,
  type Verdict,
} from './projectCardValidationCache';

interface ProjectCardValidatorProps {
  projectId: number;
  cardId: string;
  cardTitle: string;
}

const VERDICT_META: Record<Verdict, { label: string; tone: string }> = {
  valid: { label: 'Валидно по методологии', tone: 'ok' },
  partial: { label: 'Заполнено частично', tone: 'warn' },
  invalid: { label: 'Методологическая ошибка', tone: 'bad' },
  no_evidence: { label: 'Нет подтверждения в источниках', tone: 'muted' },
};

// Лёгкий стабильный хэш содержимого (djb2) — чтобы понять, изменилась ли карточка
// после последней проверки, и не тратить деньги на повторный вызов без изменений.
function hashContent(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (e.response?.status === 503) {
      return 'Поиск по методологиям доступен только на сервере с базой знаний (pgvector). Локально проверка недоступна.';
    }
    if (e.response?.status === 429) {
      return 'Слишком много проверок подряд — подождите минуту и попробуйте снова.';
    }
    if (e.response?.status === 400) {
      return 'Карточка не заполнена — добавьте содержимое перед проверкой.';
    }
    return ((e.response?.data as { detail?: string } | undefined)?.detail) || e.message;
  }
  return 'Не удалось выполнить проверку.';
}

function formatEvidence(ref: EvidenceRef): string {
  const parts: string[] = [];
  if (ref.source_key) parts.push(ref.source_key.toUpperCase());
  if (ref.page_start) {
    parts.push(
      ref.page_end && ref.page_end !== ref.page_start
        ? `стр. ${ref.page_start}–${ref.page_end}`
        : `стр. ${ref.page_start}`,
    );
  }
  if (ref.section) parts.push(`раздел «${ref.section}»`);
  return parts.join(', ');
}

export default function ProjectCardValidator({ projectId, cardId, cardTitle }: ProjectCardValidatorProps) {
  const [result, setResult] = useState<ValidationResult | null>(() => readValidationCache(projectId, cardId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [currentHash, setCurrentHash] = useState('');

  // Пересчитываем хэш текущего содержимого при переключении карточки, чтобы
  // показать «карточка изменилась после проверки».
  useEffect(() => {
    setCurrentHash(hashContent(buildCardValidationText(projectId, cardId)));
    setResult(readValidationCache(projectId, cardId));
    setError('');
    setHint('');
  }, [projectId, cardId]);

  const stale = Boolean(result) && currentHash !== '' && result?.contentHash !== currentHash;

  async function runValidation() {
    setError('');
    setHint('');
    const content = buildCardValidationText(projectId, cardId);
    if (!content.trim()) {
      setHint('Заполните карточку перед проверкой по методологии.');
      return;
    }
    const contentHash = hashContent(content);
    setLoading(true);
    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/cards/${encodeURIComponent(cardId)}/validate`,
        { card_title: cardTitle, content, content_hash: contentHash },
      );
      const next: ValidationResult = {
        answer: data.answer ?? '',
        verdict: (data.verdict as Verdict) ?? 'no_evidence',
        evidence: (data.evidence as EvidenceRef[]) ?? [],
        contentHash: data.contentHash || contentHash,
        checkedAt: data.checkedAt || new Date().toISOString(),
      };
      setResult(next);
      setCurrentHash(contentHash);
      // Сервер уже сохранил результат в БД; локальный кэш — для мгновенного показа.
      writeValidationCache(projectId, cardId, next);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }

  const meta = result ? VERDICT_META[result.verdict] : null;

  return (
    <section className="project-card-validator">
      <div className="project-card-validator-head">
        <div>
          <div className="project-panel-title">ИИ-валидатор по методологиям</div>
          <p>Проверка содержимого карточки строго по загруженным методологиям (RAG), со ссылками на источники.</p>
        </div>
        <button className="project-card-validator-btn" type="button" onClick={runValidation} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="sparkle" size={16} />}
          {result ? 'Проверить заново' : 'Проверить по методологии'}
        </button>
      </div>

      {hint && <div className="project-card-validator-hint">{hint}</div>}
      {error && <div className="project-card-validator-error">{error}</div>}

      {result && meta && (
        <div className="project-card-validator-result">
          <div className="project-card-validator-row">
            <span className={`project-card-validator-badge ${meta.tone}`}>{meta.label}</span>
            {stale && (
              <span className="project-card-validator-stale">
                Карточка изменилась после проверки — запустите проверку заново.
              </span>
            )}
          </div>
          <div className="project-card-validator-answer">
            {result.answer.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
          {result.evidence.length > 0 && (
            <div className="project-card-validator-evidence">
              <b>Найденные источники:</b>
              <ul>
                {result.evidence.map((ref, index) => {
                  const text = formatEvidence(ref);
                  return text ? <li key={index}>{text}</li> : null;
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
