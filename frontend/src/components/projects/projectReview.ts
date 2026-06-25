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

export interface ProjectCompositionResponse {
  manifest: string;
  composition: string;
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

export async function composeProject(projectId: number, projectModel: unknown): Promise<ProjectCompositionResponse> {
  const { data } = await api.post(`/api/projects/${projectId}/composition`, {
    project_model: projectModel,
  }, { timeout: AI_CALL_TIMEOUT_MS });
  return data as ProjectCompositionResponse;
}

// ── Композиция ПО БЛОКАМ (SSE + кэш по хешу: пересобираются только изменённые блоки) ──
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type CompositionBlockStatus = 'running' | 'done' | 'cached' | 'fallback';

// Событие прогресса по одному блоку композиции.
export interface CompositionBlockEvent {
  type: 'block';
  id: string;
  title: string;
  status: CompositionBlockStatus;
  error?: string;
}

// Этап полной сборки (review/finalize) — сильная модель на весь раздел целиком.
export type CompositionStageStatus = 'running' | 'done' | 'skipped' | 'fallback';

export interface CompositionStageEvent {
  type: 'stage';
  stage: 'collect' | 'structure' | 'review' | 'finalize';
  stage_no?: number;
  model?: string;
  status: CompositionStageStatus;
  error?: string;
}

// Блок исходных данных экрана для отправки на сборку.
export interface CompositionBlockInput {
  id: string;
  title: string;
  text: string;
}

export interface CompositionSection {
  manifest: string;
  composition: string;
}

// Чекпоинт композиции из БД (источник истины для гидрации после обновления страницы).
export interface CompositionState {
  status: 'idle' | 'running' | 'done' | 'failed';
  order?: string[];
  block_cache?: Record<string, { hash?: string; title?: string; composition?: string }>;
  manifest?: string;
  final?: CompositionSection;
  error?: string;
  updated_at?: string;
}

type CompositionEvent =
  | CompositionBlockEvent
  | CompositionStageEvent
  | { type: 'done'; manifest?: string; composition?: string }
  | { type: 'error'; error?: string };

export async function fetchCompositionState(projectId: number, cardId: string): Promise<CompositionState> {
  const { data } = await api.get(`/api/projects/${projectId}/composition`, { params: { card_id: cardId } });
  return data as CompositionState;
}

export async function resetComposition(projectId: number, cardId: string): Promise<void> {
  await api.post(`/api/projects/${projectId}/composition/reset`, null, { params: { card_id: cardId } });
}

interface CompositionStreamHandlers {
  onBlock?: (event: CompositionBlockEvent) => void;
  onStage?: (event: CompositionStageEvent) => void;
  onDone?: (section: CompositionSection) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Собрать композицию раздела по блокам и читать прогресс по SSE. Повторный вызов с тем же
 * card_id пересобирает ТОЛЬКО изменённые блоки (остальные берутся из кэша по хешу).
 */
export async function streamComposition(
  projectId: number,
  cardId: string,
  projectModel: unknown,
  handlers: CompositionStreamHandlers,
  mode: 'incremental' | 'full' = 'incremental',
): Promise<void> {
  const token = localStorage.getItem('access_token');
  const response = await fetch(`${API_BASE}/api/projects/${projectId}/composition/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ project_model: projectModel, card_id: cardId, mode }),
    signal: handlers.signal,
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // SSE-события разделены '\n\n'; сетевой чанк может разорвать событие.
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let parsed: CompositionEvent;
        try {
          parsed = JSON.parse(line.slice(6)) as CompositionEvent;
        } catch {
          continue; // неполный фрагмент
        }
        if (parsed.type === 'block') handlers.onBlock?.(parsed);
        else if (parsed.type === 'stage') handlers.onStage?.(parsed);
        else if (parsed.type === 'done') handlers.onDone?.({ manifest: parsed.manifest ?? '', composition: parsed.composition ?? '' });
        else if (parsed.type === 'error') handlers.onError?.(parsed.error ?? 'Ошибка композиции');
      }
    }
  }
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
  quiet = false,
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
    quiet,
  }, { timeout: AI_CALL_TIMEOUT_MS });
  return data as ChatResponse;
}
