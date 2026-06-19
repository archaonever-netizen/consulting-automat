// Машиночитаемая карта проекта для ИИ-Методолога: какие карточки и поля можно править
// (editable_cards) и какие даны только как контекст (context_cards). Модель ссылается на
// card_id / item id / ключи полей из этой карты, когда предлагает правки.
import { buildCardValidationText } from './projectCardValidation';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import {
  GENERIC_SECTION_IDS,
  NAME_KEY,
  createConfigs,
  readProjectSources,
} from './ProjectFrameworkSectionCanvas';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import type { RecordState } from './ProjectFrameworkSectionCanvas';

export interface EditableFieldSchema {
  key: string;
  label: string;
  options?: string[];
}

export interface EditableItem {
  id: string;
  label: string;
  values: Record<string, string>;
}

export interface EditableCard {
  card_id: string;
  title: string;
  card_name: string;
  item_fields: EditableFieldSchema[];
  items: EditableItem[];
}

export interface ContextCard {
  card_id: string;
  title: string;
  text: string;
}

export interface ProjectEditModel {
  editable_cards: EditableCard[];
  context_cards: ContextCard[];
}

const cardTitle = (id: string) => PROJECT_FRAMEWORK_CARDS.find(c => c.id === id)?.title || id;

/** Карта редактируемого проекта для чата Методолога. */
export function buildProjectEditModel(projectId: number): ProjectEditModel {
  const sources = readProjectSources(projectId);
  const configs = createConfigs(sources);

  const editable_cards: EditableCard[] = GENERIC_SECTION_IDS.map(cardId => {
    const config = configs[cardId];
    const snap = readProjectFrameworkSectionSnapshot(projectId, cardId);
    const records = (snap?.form as RecordState[] | undefined) ?? [];
    const item_fields: EditableFieldSchema[] = [
      { key: NAME_KEY, label: 'Название карточки' },
      ...config.fields.map(f => ({ key: f.key, label: f.label, ...(f.options ? { options: f.options } : {}) })),
    ];
    const items: EditableItem[] = records.map(record => {
      const values: Record<string, string> = {};
      for (const f of item_fields) {
        const v = record.values[f.key];
        if (v && v.trim()) values[f.key] = v;
      }
      return {
        id: String(record.id),
        label: record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || `${config.cardName}`,
        values,
      };
    });
    return { card_id: cardId, title: config.title, card_name: config.cardName, item_fields, items };
  });

  // Сложные карточки и OKR — только как контекст для анализа (правка в v1 не применяется автоматически).
  const contextIds = PROJECT_FRAMEWORK_CARDS
    .map(c => c.id)
    .filter(id => id !== 'whole-project' && !GENERIC_SECTION_IDS.includes(id));
  const context_cards: ContextCard[] = contextIds
    .map(id => ({ card_id: id, title: cardTitle(id), text: buildCardValidationText(projectId, id) }))
    .filter(c => c.text.trim().length > 0);

  return { editable_cards, context_cards };
}

/** id карточек, для которых применитель умеет вносить правки. */
export function isEditableCard(cardId: string): boolean {
  return GENERIC_SECTION_IDS.includes(cardId);
}
