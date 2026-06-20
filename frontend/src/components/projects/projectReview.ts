// Проектный ИИ-Методолог: сборка payload для оценки всего проекта, типы и api-обёртки.
// Переиспользует посекционный сериализатор содержимого из projectCardValidation.
import api from '../../services/api';
import type { EvidenceRef } from './projectCardValidationCache';
import { buildCardValidationText } from './projectCardValidation';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';

export type Rag = 'green' | 'amber' | 'red';

export interface ReviewSection {
  card_id: string;
  title: string;
  rag: Rag;
  issues: string[];
  missing: string[];
  recommendations: string[];
}

export interface ProjectReview {
  answer: string;
  overall: Rag;
  summary: string;
  sections: ReviewSection[];
  evidence: EvidenceRef[];
  has_support: boolean;
  checkedAt: string;
}

export type ProposalOp = 'update_field' | 'update_item' | 'add_item' | 'delete_item';

export interface Proposal {
  id: string;
  op: ProposalOp;
  card_id: string;
  list?: string;
  item_id?: string;
  field?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  human: string;
  rationale?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // Предложения правок, привязанные к ответу методолога (только для assistant-сообщений).
  proposals?: Proposal[];
}

export interface ChatResponse {
  reply: string;
  proposals: Proposal[];
  questions?: string[];
  evidence: EvidenceRef[];
}

// Согласованный план Методолога: текст плана + уточняющие вопросы и ответы пользователя.
// Персистится на сервере и подкладывается в каждый запрос (мимо лимита истории).
export interface ProjectPlan {
  card_id: string | null;
  text: string;
  questions: string[];
  answers: string[];
}

interface ReviewSectionPayload {
  card_id: string;
  title: string;
  text: string;
}

/** Собрать payload для оценки всего проекта: полный текст + текст по каждому разделу. */
export function buildReviewPayload(projectId: number): { full_text: string; sections: ReviewSectionPayload[] } {
  const sections: ReviewSectionPayload[] = PROJECT_FRAMEWORK_CARDS
    .filter(card => card.id !== 'whole-project')
    .map(card => ({
      card_id: card.id,
      title: card.title,
      text: buildCardValidationText(projectId, card.id),
    }));
  return {
    full_text: buildCardValidationText(projectId, 'whole-project'),
    sections,
  };
}

/** Есть ли вообще что оценивать (хотя бы один заполненный раздел). */
export function projectHasContent(projectId: number): boolean {
  return buildReviewPayload(projectId).sections.some(section => section.text.trim().length > 0);
}

export async function fetchProjectReview(
  projectId: number,
  cardId: string | null,
): Promise<{ review: ProjectReview | null; messages: ChatMessage[]; plan: ProjectPlan | null }> {
  const { data } = await api.get(`/api/projects/${projectId}/review`, {
    params: cardId ? { card_id: cardId } : undefined,
  });
  return {
    review: (data?.review as ProjectReview) ?? null,
    messages: Array.isArray(data?.messages) ? (data.messages as ChatMessage[]) : [],
    plan: (data?.plan as ProjectPlan) ?? null,
  };
}

/** «Новый чат»: очистить чат и план карточки-фокуса на сервере. */
export async function resetProjectChat(projectId: number, cardId: string | null): Promise<void> {
  await api.post(`/api/projects/${projectId}/review/chat/reset`, null, {
    params: cardId ? { card_id: cardId } : undefined,
  });
}

// Страховочный таймаут на медленные ИИ-вызовы: бэкенд и сам ограничивает время и
// возвращает мягкий фолбэк, но если соединение «молчит» — клиент не виснет вечно.
const AI_CALL_TIMEOUT_MS = 240000;

export async function runProjectReview(projectId: number): Promise<ProjectReview> {
  const { data } = await api.post(
    `/api/projects/${projectId}/review`, buildReviewPayload(projectId), { timeout: AI_CALL_TIMEOUT_MS },
  );
  return data as ProjectReview;
}

export async function sendProjectChat(
  projectId: number,
  message: string,
  history: ChatMessage[],
  projectModel: unknown,
  review: ProjectReview | null,
  focusCardId: string | null,
  deep: boolean,
  mode: 'plan' | 'fill',
  plan: ProjectPlan | null,
): Promise<ChatResponse> {
  const { data } = await api.post(`/api/projects/${projectId}/review/chat`, {
    message,
    history: history.map(({ role, content }) => ({ role, content })),
    project_model: projectModel,
    review,
    focus_card_id: focusCardId,
    deep,
    mode,
    plan,
  }, { timeout: AI_CALL_TIMEOUT_MS });
  return data as ChatResponse;
}
