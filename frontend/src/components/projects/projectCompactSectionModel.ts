import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import { buildProjectEditModel, type EditableCard, type EditableFieldSchema, type EditableItem } from './projectEditModel';
import { readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { readProjectTheorySnapshot } from './projectTheorySnapshot';

export interface CompactField {
  label: string;
  value: string;
}

export interface CompactItem {
  id: string;
  title: string;
  fields: CompactField[];
}

export interface CompactGroup {
  title: string;
  items: CompactItem[];
}

export interface CompactSectionSummary {
  filledFields: number;
  totalFields: number;
  filledItems: number;
  totalItems: number;
  status: 'empty' | 'partial' | 'filled';
}

export interface CompactSectionModel {
  cardId: string;
  title: string;
  description: string;
  updatedAt: string;
  fields: CompactField[];
  groups: CompactGroup[];
  summary: CompactSectionSummary;
}

const SECTION_CARD_IDS = new Set([
  'strategy-map',
  'hypotheses',
  'experiments',
  'decisions',
  'okr-kpi',
  'initiatives',
  'business-processes',
  'tasks',
  'facts-learning',
]);

function clean(value: unknown): string {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join('; ');
  return typeof value === 'string' ? value.trim() : '';
}

function isFilled(value: unknown): boolean {
  return clean(value).length > 0;
}

function fieldLabel(schema: EditableFieldSchema[] | undefined, key: string): string {
  return schema?.find(field => field.key === key)?.label || key;
}

function itemFields(item: EditableItem, schema: EditableFieldSchema[] | undefined): CompactField[] {
  const preferredKeys = schema?.map(field => field.key) ?? [];
  const keys = [...preferredKeys, ...Object.keys(item.values).filter(key => !preferredKeys.includes(key))];
  return keys
    .map(key => ({ label: fieldLabel(schema, key), value: clean(item.values[key]) }))
    .filter(field => field.value.length > 0);
}

function countCardFields(card: EditableCard): Pick<CompactSectionSummary, 'filledFields' | 'totalFields' | 'filledItems' | 'totalItems'> {
  let totalFields = card.fields?.length ?? 0;
  let filledFields = (card.fields ?? []).filter(field => isFilled(field.value)).length;
  let totalItems = 0;
  let filledItems = 0;

  for (const list of card.lists) {
    const itemFieldCount = list.item_fields?.length ?? 0;
    for (const item of list.items) {
      totalItems += 1;
      totalFields += itemFieldCount || Object.keys(item.values).length;
      const filled = itemFields(item, list.item_fields).length;
      filledFields += filled;
      if (filled > 0) filledItems += 1;
    }
  }

  return { filledFields, totalFields, filledItems, totalItems };
}

function cardUpdatedAt(projectId: number, cardId: string): string {
  if (cardId === 'project-theory') return readProjectTheorySnapshot(projectId)?.updatedAt || '';
  if (cardId === 'diagnosis') return readProjectDiagnosisSnapshot(projectId)?.updatedAt || '';
  if (cardId === 'strategic-choice') return readProjectStrategicChoiceSnapshot(projectId)?.updatedAt || '';
  if (cardId === 'target-state') return readProjectTargetStateSnapshot(projectId)?.updatedAt || '';
  if (SECTION_CARD_IDS.has(cardId)) return readProjectFrameworkSectionSnapshot(projectId, cardId)?.updatedAt || '';
  return '';
}

export function buildCompactSectionModel(projectId: number, cardId: string): CompactSectionModel | null {
  const card = buildProjectEditModel(projectId).editable_cards.find(item => item.card_id === cardId);
  if (!card) return null;

  const frameworkCard = PROJECT_FRAMEWORK_CARDS.find(item => item.id === cardId);
  const fields = (card.fields ?? [])
    .map(field => ({ label: field.label, value: clean(field.value) }))
    .filter(field => field.value.length > 0);

  const groups = card.lists
    .map(list => ({
      title: list.title,
      items: list.items
        .map(item => ({ id: item.id, title: item.label, fields: itemFields(item, list.item_fields) }))
        .filter(item => item.fields.length > 0),
    }))
    .filter(group => group.items.length > 0);

  const counts = countCardFields(card);
  const hasContent = fields.length > 0 || groups.length > 0;
  const status = !hasContent ? 'empty' : counts.totalFields > 0 && counts.filledFields >= counts.totalFields ? 'filled' : 'partial';

  return {
    cardId,
    title: card.title,
    description: frameworkCard?.description || '',
    updatedAt: cardUpdatedAt(projectId, cardId),
    fields,
    groups,
    summary: { ...counts, status },
  };
}
