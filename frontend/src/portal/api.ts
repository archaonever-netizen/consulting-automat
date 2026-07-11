// Минимальный API-клиент портала. НЕ импортирует код основного приложения —
// портал автономен, чтобы его можно было вынести на отдельный сервер (Этап 3).
// Свой ключ токена и свой базовый URL.

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const TOKEN_KEY = 'portal_token';

export interface PortalMe {
  full_name: string;
  is_preview: boolean;
  client_id: number;
  client_name: string;
  sections: string[];
}

export interface PortalProject {
  id: number;
  name: string;
  description: string | null;
  updated_at_fmt: string;
  sections?: PortalProjectSection[];
}

export interface PortalProjectSection {
  id: string;
  title: string;
  description: string;
  // Фаза жизненного цикла проекта — портал группирует разделы в 4 фазы.
  phase?: string;
  phase_label?: string;
  phase_summary?: string;
  phase_order?: number;
  // Человеческая композиция раздела (приоритетный источник). Пустая → fallback на fields/groups.
  composition?: string;
  manifest?: string;
  fields: PortalProjectField[];
  groups: PortalProjectGroup[];
  updated_at?: string | null;
}

export interface PortalProjectField {
  label: string;
  value: string;
}

export interface PortalProjectGroup {
  title: string;
  items: PortalProjectItem[];
}

export interface PortalProjectItem {
  title: string;
  fields: PortalProjectField[];
}

export interface PortalDocument {
  id: number;
  title: string;
  original_filename: string;
  source_type: 'local' | 'yandex_disk';
  source_label: string;
  content_type: string;
  size_bytes: number;
  created_at_fmt: string;
}

// ── Этапы проекта ────────────────────────────────────────────────────────────
export interface PortalStage {
  title: string;
  status: 'done' | 'active' | 'upcoming';
  period: string;
  summary: string;
}
export interface PortalStages {
  current: number;
  items: PortalStage[];
}

// ── Статус проекта ───────────────────────────────────────────────────────────
export interface PortalStatusMetric {
  label: string;
  value: string;
  delta: string;
  dir: 'up' | 'down' | 'flat';
  positive: boolean;
}
export interface PortalStatus {
  headline: string;
  health: string;
  health_label: string;
  progress: number;
  summary: string;
  metrics: PortalStatusMetric[];
  next_step: { title: string; due: string } | null;
  focus: string[];
}

// ── События ──────────────────────────────────────────────────────────────────
export interface PortalEvent {
  date: string;
  type: 'milestone' | 'meeting' | 'update' | 'document';
  title: string;
  text: string;
}
export interface PortalEvents {
  items: PortalEvent[];
}

// ── Информация ───────────────────────────────────────────────────────────────
export interface PortalInfoMember {
  name: string;
  role: string;
  contact: string;
}
export interface PortalInfo {
  team: PortalInfoMember[];
  facts: PortalProjectField[];
  faq: { q: string; a: string }[];
}

export interface PortalData {
  project?: PortalProject[];
  stages?: PortalStages | null;
  status?: PortalStatus | null;
  events?: PortalEvents | null;
  info?: PortalInfo | null;
  documents?: PortalDocument[];
}

export interface PortalRequestInput {
  subject: string;
  message: string;
  contact?: string;
}

export class PortalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch { /* пустое тело — ок */ }
    if (res.status === 401) clearToken();
    throw new PortalError(res.status, detail || `Ошибка ${res.status}`);
  }
  return res;
}

export const portalApi = {
  async login(email: string, password: string): Promise<void> {
    const res = await request('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setToken(data.access_token);
  },

  async me(): Promise<PortalMe> {
    return (await request('/api/portal/me')).json();
  },

  async data(): Promise<PortalData> {
    return (await request('/api/portal/data')).json();
  },

  async submitRequest(input: PortalRequestInput): Promise<void> {
    await request('/api/portal/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  // Скачивание идёт через fetch с Authorization, затем blob → клик по ссылке
  // (обычный <a href> не отправил бы заголовок авторизации).
  async download(doc: PortalDocument): Promise<void> {
    const res = await request(`/api/portal/documents/${doc.id}/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.original_filename || doc.title || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
