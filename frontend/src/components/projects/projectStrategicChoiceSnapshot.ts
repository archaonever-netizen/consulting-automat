export type ProjectStrategicChoiceSnapshotItem = {
  id: string;
  label: string;
  summary: string;
};

export type ProjectStrategicChoiceSnapshot = {
  projectId: number;
  updatedAt: string;
  strategicQuestion: string;
  winningAspiration: string;
  winType: string;
  whereToPlay: string;
  whereClient: string;
  whereGeography: string;
  whereProduct: string;
  whereProcess: string;
  whereIncluded: string;
  whereExcluded: string;
  howToWin: string;
  howDiagnosisFit: string;
  howValue: string;
  howAdvantage: string;
  howSystemChange: string;
  howBetterThanAlternatives: string;
  managementSystems: string;
  acceptedChoice: string;
  guidingPolicy: string;
  capabilities: ProjectStrategicChoiceSnapshotItem[];
  tradeOffs: ProjectStrategicChoiceSnapshotItem[];
  actions: ProjectStrategicChoiceSnapshotItem[];
  hypotheses: ProjectStrategicChoiceSnapshotItem[];
  // Полное состояние редактора (lossless) для восстановления ввода при возврате на экран.
  form?: unknown;
};

export function getFallbackProjectStrategicChoiceSnapshot(projectId: number): ProjectStrategicChoiceSnapshot {
  return {
    projectId,
    updatedAt: '',
    strategicQuestion: '',
    winningAspiration: '',
    winType: '',
    whereToPlay: '',
    whereClient: '',
    whereGeography: '',
    whereProduct: '',
    whereProcess: '',
    whereIncluded: '',
    whereExcluded: '',
    howToWin: '',
    howDiagnosisFit: '',
    howValue: '',
    howAdvantage: '',
    howSystemChange: '',
    howBetterThanAlternatives: '',
    managementSystems: '',
    acceptedChoice: '',
    guidingPolicy: '',
    capabilities: [],
    tradeOffs: [],
    actions: [],
    hypotheses: [],
  };
}

export function getProjectStrategicChoiceSnapshotKey(projectId: number) {
  return `project_strategic_choice_snapshot:${projectId}`;
}

export function readProjectStrategicChoiceSnapshot(projectId: number): ProjectStrategicChoiceSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getProjectStrategicChoiceSnapshotKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectStrategicChoiceSnapshot;
  } catch {
    return null;
  }
}

export function writeProjectStrategicChoiceSnapshot(projectId: number, snapshot: ProjectStrategicChoiceSnapshot) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getProjectStrategicChoiceSnapshotKey(projectId), JSON.stringify(snapshot));
}
