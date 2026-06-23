// Машиночитаемая карта проекта для ИИ-Методолога: какие карточки/поля можно править
// (editable_cards) и какие даны только как контекст (context_cards). Модель ссылается на
// card_id / list / item id / ключи полей из этой карты, когда предлагает правки.
import { buildCardValidationText } from './projectCardValidation';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import {
  GENERIC_SECTION_IDS,
  NAME_KEY,
  createConfigs,
  readProjectSources,
} from './ProjectFrameworkSectionCanvas';
import type { RecordState } from './ProjectFrameworkSectionCanvas';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import {
  COMPLEX_CARDS,
  COMPLEX_CARD_IDS,
  deriveProjItem,
  isComplexCard,
  itemLabel,
  itemValues,
  listItemFields,
  type FormItem,
} from './projectComplexCards';
import { THEORY_CARD_ID, buildTheoryEditable, isTheoryCard } from './projectTheoryCards';
import { OKR_CARD_ID, buildOkrEditable, isOkrCard } from './projectOkrCards';

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

export interface EditableList {
  list: string;        // '' для секции (единственный список), иначе projKey списка
  title: string;
  item_fields?: EditableFieldSchema[];
  items: EditableItem[];
}

export interface EditableScalarField {
  key: string;
  label: string;
  value: string;
  options?: string[];
}

export interface EditableCard {
  card_id: string;
  title: string;
  fields?: EditableScalarField[]; // скаляры (для сложных карточек)
  lists: EditableList[];
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

function buildSectionEditable(projectId: number, cardId: string): EditableCard {
  const sources = readProjectSources(projectId);
  const config = createConfigs(sources)[cardId];
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
      label: record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || config.cardName,
      values,
    };
  });
  return { card_id: cardId, title: config.title, lists: [{ list: '', title: config.cardName, item_fields, items }] };
}

function buildComplexEditable(projectId: number, cardId: string): EditableCard {
  const spec = COMPLEX_CARDS[cardId];
  const base = spec.read(projectId) ?? spec.fallback(projectId);
  const form = (base.form && typeof base.form === 'object' ? base.form : {}) as Record<string, unknown>;
  const container = (form[spec.scalarContainer] && typeof form[spec.scalarContainer] === 'object'
    ? form[spec.scalarContainer]
    : base) as Record<string, unknown>;

  const fields: EditableScalarField[] = spec.scalarFields.map(f => {
    // Скаляр-ссылка отдаёт динамические опции (существующие цели), как refFields списков.
    const options = f.refOptions ? f.refOptions(form, projectId) : f.options;
    return {
      key: f.key,
      label: f.label,
      value: typeof container[f.key] === 'string' ? (container[f.key] as string) : '',
      ...(options && options.length ? { options } : {}),
    };
  });

  const lists: EditableList[] = spec.lists.map(listSpec => {
    const arr = (Array.isArray(form[listSpec.formKey]) ? form[listSpec.formKey] : []) as FormItem[];
    const items: EditableItem[] = arr.map((item, index) => ({
      id: String(item.id),
      label: itemLabel(item, listSpec.labelKeys, `${listSpec.title} ${index + 1}`),
      values: itemValues(item),
    }));
    // item_fields — полная схема полей элемента (даже пустых), чтобы модель заполняла окно
    // целиком и добавляла недостающие, а не правила только видимые непустые поля.
    // form передаём для динамических опций полей-ссылок (варианты = существующие элементы).
    return { list: listSpec.projKey, title: listSpec.title, item_fields: listItemFields(listSpec, arr, form, projectId), items };
  });

  return { card_id: cardId, title: spec.title, fields, lists };
}

/** Карта редактируемого проекта для чата Методолога. */
export function buildProjectEditModel(projectId: number): ProjectEditModel {
  const editable_cards: EditableCard[] = [
    ...GENERIC_SECTION_IDS.map(id => buildSectionEditable(projectId, id)),
    ...COMPLEX_CARD_IDS.map(id => buildComplexEditable(projectId, id)),
    buildTheoryEditable(projectId),
    buildOkrEditable(projectId),
  ];

  // Все каркасные карточки теперь редактируемы; в context_cards остаётся только то, что не editable.
  const editableIds = new Set([...GENERIC_SECTION_IDS, ...COMPLEX_CARD_IDS, THEORY_CARD_ID, OKR_CARD_ID]);
  const context_cards: ContextCard[] = PROJECT_FRAMEWORK_CARDS
    .map(c => c.id)
    .filter(id => id !== 'whole-project' && !editableIds.has(id))
    .map(id => ({ card_id: id, title: cardTitle(id), text: buildCardValidationText(projectId, id).slice(0, 800) }))
    .filter(c => c.text.trim().length > 0);

  return { editable_cards, context_cards };
}

/** id карточек, для которых применитель умеет вносить правки. */
export function isEditableCard(cardId: string): boolean {
  return GENERIC_SECTION_IDS.includes(cardId) || isComplexCard(cardId) || isTheoryCard(cardId) || isOkrCard(cardId);
}

// re-export для применителя/тестов
export { deriveProjItem };
