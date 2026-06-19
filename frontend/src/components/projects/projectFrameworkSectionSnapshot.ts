import { pushCardSnapshot } from './projectCardServerSync';

export type ProjectFrameworkSectionSnapshotItem = {
  id: string;
  label: string;
  summary: string;
  status: string;
};

export type ProjectFrameworkSectionSnapshot = {
  projectId: number;
  sectionId: string;
  title: string;
  updatedAt: string;
  items: ProjectFrameworkSectionSnapshotItem[];
  completedChecks: number;
  totalChecks: number;
  // Полное состояние редактора (lossless), чтобы восстанавливать ввод при возврате
  // на экран. items выше — производная выжимка для нижележащих экранов. Тип зависит
  // от продьюсера (records у обычных секций, objectives у OKR), поэтому хранится как
  // непрозрачный payload и приводится к нужному типу при чтении.
  form?: unknown;
};

export function getProjectFrameworkSectionSnapshotKey(projectId: number, sectionId: string) {
  return `project_framework_section_snapshot:${projectId}:${sectionId}`;
}

export function readProjectFrameworkSectionSnapshot(projectId: number, sectionId: string): ProjectFrameworkSectionSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getProjectFrameworkSectionSnapshotKey(projectId, sectionId));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectFrameworkSectionSnapshot;
  } catch {
    return null;
  }
}

export function writeProjectFrameworkSectionSnapshot(projectId: number, sectionId: string, snapshot: ProjectFrameworkSectionSnapshot) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getProjectFrameworkSectionSnapshotKey(projectId, sectionId), JSON.stringify(snapshot));
  pushCardSnapshot(projectId, sectionId, snapshot);
}
