import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Icon from '../Icon';
import type { EvidenceRef } from './projectCardValidationCache';
import { applyProjectEdit } from './projectEditApplier';
import { buildProjectEditModel } from './projectEditModel';
import {
  fetchProjectReview,
  projectHasContent,
  runProjectReview,
  sendProjectChat,
  type ChatMessage,
  type ProjectReview,
  type Proposal,
  type Rag,
} from './projectReview';

interface ProjectMethodologistProps {
  projectId: number;
  // Вызывается после применённой правки, чтобы перемонтировать открытый канвас.
  onProjectMutated: () => void;
}

const RAG_META: Record<Rag, { label: string; tone: string }> = {
  green: { label: 'GREEN', tone: 'ok' },
  amber: { label: 'AMBER', tone: 'warn' },
  red: { label: 'RED', tone: 'bad' },
};

const OP_LABEL: Record<Proposal['op'], string> = {
  add_item: 'Добавить окно',
  update_item: 'Изменить формулировку',
  update_field: 'Изменить поле',
  delete_item: 'Удалить окно',
};

type ProposalState = { status: 'applied' | 'rejected' | 'failed'; message: string };

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (e.response?.status === 503) {
      return 'Анализ по методологиям доступен только на сервере с базой знаний (pgvector). Локально проверка недоступна.';
    }
    if (e.response?.status === 429) {
      return 'Слишком много обращений к ИИ подряд — подождите минуту и попробуйте снова.';
    }
    return ((e.response?.data as { detail?: string } | undefined)?.detail) || e.message;
  }
  return 'Не удалось выполнить запрос.';
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

// Простой рендер текста: абзацы по \n, жирный для строк-заголовков «**...**».
function TextLines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').filter(Boolean).map((line, i) => {
        const bold = /^\*\*(.+?)\*\*:?$/.exec(line.trim());
        if (bold) return <p key={i}><b>{bold[1]}</b></p>;
        return <p key={i}>{line.replace(/\*\*/g, '')}</p>;
      })}
    </>
  );
}

export default function ProjectMethodologist({ projectId, onProjectMutated }: ProjectMethodologistProps) {
  const [review, setReview] = useState<ProjectReview | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>({});

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Гидрация сохранённого ревью + истории чата при открытии проекта.
  useEffect(() => {
    let cancelled = false;
    setReview(null);
    setMessages([]);
    setProposalStates({});
    setReviewError('');
    fetchProjectReview(projectId)
      .then(({ review: r, messages: m }) => {
        if (cancelled) return;
        setReview(r);
        setMessages(m);
      })
      .catch(() => { /* офлайн/первый заход — просто пустая панель */ });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function runValidation() {
    setReviewError('');
    if (!projectHasContent(projectId)) {
      setReviewError('Проект пока пуст — заполните хотя бы один раздел перед валидацией.');
      return;
    }
    setLoadingReview(true);
    try {
      setReview(await runProjectReview(projectId));
    } catch (e) {
      setReviewError(errText(e));
    } finally {
      setLoadingReview(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages;
    setMessages([...history, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const res = await sendProjectChat(projectId, text, history, buildProjectEditModel(projectId), review);
      setMessages(cur => [...cur, { role: 'assistant', content: res.reply, proposals: res.proposals }]);
    } catch (e) {
      setMessages(cur => [...cur, { role: 'assistant', content: errText(e) }]);
    } finally {
      setSending(false);
    }
  }

  function applyProposal(key: string, proposal: Proposal) {
    const result = applyProjectEdit(projectId, proposal);
    setProposalStates(cur => ({
      ...cur,
      [key]: { status: result.ok ? 'applied' : 'failed', message: result.message },
    }));
    if (result.ok) {
      onProjectMutated();
      // Зафиксировать подтверждение в истории, чтобы модель знала о применённой правке.
      setMessages(cur => [...cur, { role: 'user', content: `Я подтвердил и применил изменение: ${proposal.human}` }]);
    }
  }

  function rejectProposal(key: string) {
    setProposalStates(cur => ({ ...cur, [key]: { status: 'rejected', message: 'Отклонено' } }));
  }

  return (
    <aside className="project-side project-right-panel project-methodologist">
      <div className="project-panel-title">ИИ-Методолог проекта</div>
      <p className="project-methodologist-lead">
        Полный анализ проекта по методологиям с оценкой-светофором. После проверки уточните детали в чате —
        правки вносятся только после вашего подтверждения.
      </p>

      <button className="project-card-validator-btn" type="button" onClick={runValidation} disabled={loadingReview}>
        {loadingReview ? <span className="spinner" /> : <Icon name="sparkle" size={16} />}
        {review ? 'Проверить заново' : 'Валидация'}
      </button>

      {reviewError && <div className="project-card-validator-error">{reviewError}</div>}

      {review && (
        <div className="project-review">
          <div className={`rag-badge big ${RAG_META[review.overall].tone}`}>
            Проект в целом: {RAG_META[review.overall].label}
          </div>
          {review.summary && <p className="project-review-summary">{review.summary}</p>}

          <div className="project-review-sections">
            {review.sections.map(section => (
              <div className={`project-review-section ${RAG_META[section.rag].tone}`} key={section.card_id}>
                <div className="project-review-section-head">
                  <span className={`rag-dot ${RAG_META[section.rag].tone}`} />
                  <b>{section.title}</b>
                  <span className="rag-tag">{RAG_META[section.rag].label}</span>
                </div>
                {section.issues.length > 0 && (
                  <div className="project-review-line"><span>⚠️ Ошибки:</span> {section.issues.join('; ')}</div>
                )}
                {section.missing.length > 0 && (
                  <div className="project-review-line"><span>🧩 Не хватает:</span> {section.missing.join('; ')}</div>
                )}
                {section.recommendations.length > 0 && (
                  <div className="project-review-line"><span>✅ Исправить:</span> {section.recommendations.join('; ')}</div>
                )}
              </div>
            ))}
          </div>

          {review.evidence.length > 0 && (
            <div className="project-card-validator-evidence">
              <b>Источники:</b>
              <ul>
                {review.evidence.map((ref, i) => {
                  const t = formatEvidence(ref);
                  return t ? <li key={i}>{t}</li> : null;
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="project-methodologist-chat">
        <div className="project-chat-messages">
          {messages.length === 0 && (
            <div className="project-chat-empty">Задайте вопрос по проекту или попросите внести правку.</div>
          )}
          {messages.map((m, idx) => (
            <div className={`project-chat-msg ${m.role}`} key={idx}>
              <div className="project-chat-bubble">
                <TextLines text={m.content} />
              </div>
              {m.role === 'assistant' && m.proposals && m.proposals.length > 0 && (
                <div className="project-proposals">
                  {m.proposals.map(p => {
                    const key = `${idx}:${p.id}`;
                    const state = proposalStates[key];
                    return (
                      <div className={`project-proposal ${state ? state.status : ''}`} key={key}>
                        <div className="project-proposal-head">
                          <span className="project-proposal-op">{OP_LABEL[p.op]}</span>
                          <span className="project-proposal-card">{p.card_id}</span>
                        </div>
                        <div className="project-proposal-human">{p.human}</div>
                        {p.rationale && <div className="project-proposal-rationale">{p.rationale}</div>}
                        {state ? (
                          <div className={`project-proposal-result ${state.status}`}>{state.message}</div>
                        ) : (
                          <div className="project-proposal-actions">
                            <button type="button" className="project-proposal-apply" onClick={() => applyProposal(key, p)}>
                              <Icon name="check" size={14} /> Применить
                            </button>
                            <button type="button" className="project-proposal-reject" onClick={() => rejectProposal(key)}>
                              <Icon name="close" size={14} /> Отклонить
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="project-chat-msg assistant">
              <div className="project-chat-bubble"><span className="spinner" /> Методолог думает…</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="project-chat-input">
          <textarea
            className="form-textarea"
            value={input}
            placeholder="Спросите методолога или попросите правку…"
            rows={2}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="project-chat-send" onClick={send} disabled={sending || !input.trim()}>
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
