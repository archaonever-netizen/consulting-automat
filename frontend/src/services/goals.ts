// API-обёртки раздела «Цели» (декомпозиция). Все вызовы — через серверный api.
import api from './api';
import type {
  GoalDocument,
  MetricDiffRow,
  ProposalResponse,
} from '../types/goalDecomposition';

export interface GoalListItem {
  goalId: string;
  title: string;
  status: string;
  updatedAt: string | null;
}

export interface MetricInput {
  id: string;
  name: string;
  unit: string;
  targetValue: number | null;
  source: 'user_input';
}

export interface CreateGoalPayload {
  title: string;
  description?: string;
  startDate: string;
  deadline: string;
  targetMetrics: MetricInput[];
  dataset?: Record<string, unknown>;
}

export async function listGoals(): Promise<GoalListItem[]> {
  const r = await api.get('/api/goals');
  return r.data;
}

export async function createGoal(p: CreateGoalPayload): Promise<{ goalId: string; document: GoalDocument }> {
  const r = await api.post('/api/goals', p);
  return r.data;
}

export async function getGoal(goalId: string): Promise<{ goalId: string; document: GoalDocument; dataset: Record<string, unknown> }> {
  const r = await api.get(`/api/goals/${goalId}`);
  return r.data;
}

export async function updateDataset(goalId: string, dataset: Record<string, unknown>): Promise<{ dataset: Record<string, unknown> }> {
  const r = await api.post(`/api/goals/${goalId}/dataset`, { dataset });
  return r.data;
}

export async function decompose(goalId: string, level: string, parentId: string | null): Promise<ProposalResponse> {
  const r = await api.post(`/api/goals/${goalId}/decompose`, { level, parentId });
  return r.data;
}

export async function getAlternatives(goalId: string, level: string, parentId: string | null, count = 3): Promise<ProposalResponse> {
  const r = await api.post(`/api/goals/${goalId}/alternatives`, { level, parentId, count });
  return r.data;
}

export interface RecalcResult {
  // На успешном пересчёте — дифф + документ; иначе (blocked/error) — поля предложения.
  diffs?: MetricDiffRow[];
  document?: GoalDocument;
  status?: string;
  error?: string | null;
}

export async function recalculate(goalId: string, parentId: string | null): Promise<RecalcResult> {
  const r = await api.post(`/api/goals/${goalId}/recalculate`, { parentId });
  return r.data;
}

export async function approvePeriod(goalId: string, periodId: string, comment?: string): Promise<{ document: GoalDocument }> {
  const r = await api.post(`/api/goals/${goalId}/periods/${periodId}/approve`, { comment });
  return r.data;
}

export async function rejectPeriod(goalId: string, periodId: string, reason: string): Promise<{ document: GoalDocument }> {
  const r = await api.post(`/api/goals/${goalId}/periods/${periodId}/reject`, { reason });
  return r.data;
}

export async function editPeriod(goalId: string, periodId: string, edits: { metricId: string; targetValue: number | null }[]): Promise<{ document: GoalDocument }> {
  const r = await api.post(`/api/goals/${goalId}/periods/${periodId}/edit`, { edits });
  return r.data;
}

export async function confirmAssumption(goalId: string, assumptionId: string, status: 'confirmed' | 'rejected', actualValue?: unknown): Promise<{ impacted: string[]; document: GoalDocument }> {
  const r = await api.post(`/api/goals/${goalId}/assumptions/${assumptionId}/confirm`, { status, actualValue });
  return r.data;
}
