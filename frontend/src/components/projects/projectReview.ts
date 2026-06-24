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

// ── Многоэтапная композиция (SSE-конвейер с поэтапным сохранением в БД) ──
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type CompositionStageKey = 'collect' | 'structure' | 'review' | 'finalize';
export type CompositionStageStatus = 'running' | 'done' | 'fallback' | 'skipped';

export interface CompositionStageEvent {
  type: 'stage';
  stage: CompositionStageKey;
  stage_no: number;
  model: string;
  status: CompositionStageStatus;
  cached?: boolean;
  error?: string;
  recommendations?: string[];
  verdict?: string;
}

export interface CompositionSection {
  manifest: string;
  composition: string;
}

// Чекпоинт композиции из БД (источник истины для гидрации после обновления страницы).
export interface CompositionState {
  status: 'idle' | 'collecting' | 'structuring' | 'reviewing' | 'finalizing' | 'done' | 'failed';
  stage_no?: number;
  draft?: CompositionSection;
  structured?: CompositionSection;
  recommendations?: { verdict: string; recommendations: string[] };
  final?: CompositionSection;
  error?: string;
  updated_at?: string;
}

type CompositionEvent =
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
  onStage?: (event: CompositionStageEvent) => void;
  onDone?: (section: CompositionSection) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Запустить (или возобновить) многоэтапную композицию раздела и читать прогресс по SSE.
 * Возобновление — повторный вызов с тем же card_id: бэкенд продолжит с незавершённого этапа.
 */
export async function streamComposition(
  projectId: number,
  cardId: string,
  projectModel: unknown,
  handlers: CompositionStreamHandlers,
): Promise<void> {
  const token = localStorage.getItem('access_token');
  const response = await fetch(`${API_BASE}/api/projects/${projectId}/composition/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ project_model: projectModel, card_id: cardId }),
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
        if (parsed.type === 'stage') handlers.onStage?.(parsed);
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
