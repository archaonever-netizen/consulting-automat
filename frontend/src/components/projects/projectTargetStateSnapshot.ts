import { pushCardSnapshot } from './projectCardServerSync';

export type ProjectTargetStateSnapshotItem = {
  id: string;
  label: string;
  summary: string;
};

export type ProjectTargetStateSnapshot = {
  projectId: number;
  updatedAt: string;
  statement: string;
  type: string;
  whereToPlay: string;
  howToWin: string;
  objective: string;
  finalStatement: string;
  results: ProjectTargetStateSnapshotItem[];
  stakeholderValues: ProjectTargetStateSnapshotItem[];
  operatingModels: ProjectTargetStateSnapshotItem[];
  capabilities: ProjectTargetStateSnapshotItem[];
  managementSystems: ProjectTargetStateSnapshotItem[];
  qualityTargets: ProjectTargetStateSnapshotItem[];
  preserveTargets: ProjectTargetStateSnapshotItem[];
  constraints: ProjectTargetStateSnapshotItem[];
  keyResults: ProjectTargetStateSnapshotItem[];
  // Полное состояние редактора (lossless) для восстановления ввода при возврате на экран.
  form?: unknown;
};

export function getFallbackProjectTargetStateSnapshot(projectId: number): ProjectTargetStateSnapshot {
  return {
    projectId,
    updatedAt: '',
    statement: '',
    type: '',
    whereToPlay: '',
    howToWin: '',
    objective: '',
    finalStatement: '',
    results: [],
    stakeholderValues: [],
    operatingModels: [],
    capabilities: [],
    managementSystems: [],
    qualityTargets: [],
    preserveTargets: [],
    constraints: [],
    keyResults: [],
  };
}

export function getProjectTargetStateSnapshotKey(projectId: number) {
  return `project_target_state_snapshot:${projectId}`;
}

export function readProjectTargetStateSnapshot(projectId: number): ProjectTargetStateSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getProjectTargetStateSnapshotKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectTargetStateSnapshot;
  } catch {
    return null;
  }
}

export function writeProjectTargetStateSnapshot(projectId: number, snapshot: ProjectTargetStateSnapshot) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getProjectTargetStateSnapshotKey(projectId), JSON.stringify(snapshot));
  pushCardSnapshot(projectId, 'target-state', snapshot);
}
