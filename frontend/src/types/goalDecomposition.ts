// Типы документа декомпозиции целей — зеркало backend (camelCase, schemaVersion 1.0.0).

export type Source = 'user_input' | 'derived' | 'assumption';
export type Confidence = 'measured' | 'high' | 'medium' | 'low';
export type Aggregation = 'flow' | 'endpoint';
export type PeriodLevel = 'MONTH' | 'WEEK' | 'DAY';
export type ApprovalStatus =
  | 'draft' | 'proposed_by_ai' | 'under_review'
  | 'approved' | 'rejected' | 'needs_revision';
export type AssumptionStatus = 'unconfirmed' | 'confirmed' | 'rejected';
export type MilestoneStatus = 'planned' | 'in_progress' | 'done' | 'blocked';

export interface Derivation {
  formula: string;
  inputs: string[];
}

export interface Metric {
  id: string;
  name: string;
  unit: string;
  targetValue?: number | null;
  currentValue?: number | null;
  measuredAt?: string | null;
  source: Source;
  derivation?: Derivation | null;
  assumptionRef?: string | null;
  confidence?: Confidence | null;
  evidence?: string | null;
  aggregation?: Aggregation;
}

export interface Assumption {
  id: string;
  statement: string;
  assumedValue: number | string;
  unit?: string;
  basis?: string;
  needsConfirmationFrom?: string;
  impact?: string[];
  status: AssumptionStatus;
}

export interface DataGap {
  id: string;
  requiredParameter: string;
  expectedUnit?: string;
  whyNeeded?: string;
  suggestedSource?: string;
  blocksDecomposition: boolean;
}

export interface Milestone {
  title: string;
  dueDate: string;
  status: MilestoneStatus;
  dependsOn?: string[];
}

export interface ApprovalRecord {
  status: ApprovalStatus;
  proposedBy: 'ai' | 'human';
  reviewedBy?: string | null;
  decidedAt?: string | null;
  comment?: string | null;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface Period {
  id: string;
  level: PeriodLevel;
  index: number;
  parentId?: string | null;
  goalId?: string;
  dateRange: DateRange;
  allocatedMetrics: Metric[];
  milestones: Milestone[];
  assumptions: Assumption[];
  dataGaps: DataGap[];
  approval: ApprovalRecord;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  deadline: string;
  targetMetrics: Metric[];
  constraints: unknown[];
  assumptions: Assumption[];
  dataGaps: DataGap[];
  status: string;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  actor: { kind: 'human' | 'ai'; ref: string };
  entityRef: string;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  triggeredRecalculation?: boolean | null;
}

export interface GoalDocument {
  schemaVersion: string;
  goal: Goal;
  periods: Period[];
  changeLog: ChangeLogEntry[];
}

// Ответ движка декомпозиции (proposed | blocked | error).
export interface ProposalResponse {
  status: 'proposed' | 'blocked' | 'error';
  level: string;
  children: unknown[];
  assumptions: Assumption[];
  dataGaps: DataGap[];
  alternatives: AlternativeOption[];
  notes: string;
  attempts: number;
  error?: string | null;
}

export interface AlternativeOption {
  label?: string;
  tradeoff?: string;
  children: unknown[];
  assumptions?: Assumption[];
}

export interface MetricDiffRow {
  periodId: string;
  metricId: string;
  field: string;
  oldValue: number | null;
  newValue: number | null;
  preserved: boolean;
}
