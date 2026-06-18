export type ProjectDiagnosisSnapshotItem = {
  id: string;
  label: string;
  summary: string;
};

export type ProjectDiagnosisSnapshot = {
  projectId: number;
  updatedAt: string;
  rawRequest: string;
  requestType: string;
  requestContext: string;
  areas: string[];
  keyChallenge: string;
  obstacleType: string;
  limitingFactor: string;
  scale: string;
  strategicConclusion: string;
  exclusions: string;
  finalStatement: string;
  gaps: ProjectDiagnosisSnapshotItem[];
  symptoms: ProjectDiagnosisSnapshotItem[];
  facts: ProjectDiagnosisSnapshotItem[];
  alternatives: ProjectDiagnosisSnapshotItem[];
  consequences: ProjectDiagnosisSnapshotItem[];
};

export function getFallbackProjectDiagnosisSnapshot(projectId: number): ProjectDiagnosisSnapshot {
  return {
    projectId,
    updatedAt: '',
    rawRequest: '',
    requestType: '',
    requestContext: '',
    areas: [],
    keyChallenge: '',
    obstacleType: '',
    limitingFactor: '',
    scale: '',
    strategicConclusion: '',
    exclusions: '',
    finalStatement: '',
    gaps: [],
    symptoms: [],
    facts: [],
    alternatives: [],
    consequences: [],
  };
}

export function getProjectDiagnosisSnapshotKey(projectId: number) {
  return `project_diagnosis_snapshot:${projectId}`;
}

export function readProjectDiagnosisSnapshot(projectId: number): ProjectDiagnosisSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getProjectDiagnosisSnapshotKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectDiagnosisSnapshot;
  } catch {
    return null;
  }
}

export function writeProjectDiagnosisSnapshot(projectId: number, snapshot: ProjectDiagnosisSnapshot) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getProjectDiagnosisSnapshotKey(projectId), JSON.stringify(snapshot));
}
