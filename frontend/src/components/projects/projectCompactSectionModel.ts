import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import { buildProjectEditModel, type EditableFieldSchema, type EditableItem } from './projectEditModel';

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

export interface CompactSectionModel {
  cardId: string;
  title: string;
  description: string;
  fields: CompactField[];
  groups: CompactGroup[];
}

function clean(value: unknown): string {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join('; ');
  return typeof value === 'string' ? value.trim() : '';
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

  return {
    cardId,
    title: card.title,
    description: frameworkCard?.description || '',
    fields,
    groups,
  };
}
