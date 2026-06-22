// Реестр смысловых кластеров для графа «Весь проект».
// Одна сущность (напр. «Выгодоприобретатель/Стейкхолдер») в методологии повторяется в нескольких
// карточках. Кластер объединяет эти источники в один узел: cluster → список (cardId, listKey),
// где listKey совпадает с `list` из buildProjectEditModel (projKey сложной карточки / block.list Теории).
// Узел-кластер агрегирует элементы всех источников; каждый элемент помнит origin для правки/перехода.
import type { EditableItem } from './projectEditModel';

export interface ClusterSource {
  cardId: string;
  list: string;
}

export interface ClusterSpec {
  id: string;
  title: string;
  sources: ClusterSource[]; // первый источник — «первичный» (туда уходит добавление)
}

export const PROJECT_CLUSTERS: ClusterSpec[] = [
  {
    id: 'stakeholders',
    title: 'Стейкхолдеры',
    sources: [
      { cardId: 'project-theory', list: 'stakeholder' },
      { cardId: 'target-state', list: 'stakeholderValues' },
    ],
  },
  {
    id: 'results',
    title: 'Результаты',
    sources: [
      { cardId: 'project-theory', list: 'results' },
      { cardId: 'target-state', list: 'results' },
      { cardId: 'target-state', list: 'keyResults' },
    ],
  },
  {
    id: 'capabilities',
    title: 'Способности',
    sources: [
      { cardId: 'project-theory', list: 'competencies' },
      { cardId: 'strategic-choice', list: 'capabilities' },
      { cardId: 'target-state', list: 'capabilities' },
    ],
  },
  {
    id: 'constraints',
    title: 'Ограничения',
    sources: [
      { cardId: 'project-theory', list: 'constraints' },
      { cardId: 'target-state', list: 'constraints' },
    ],
  },
  {
    id: 'quality',
    title: 'Качество',
    sources: [
      { cardId: 'project-theory', list: 'quality' },
      { cardId: 'target-state', list: 'qualityTargets' },
    ],
  },
  {
    id: 'preserve',
    title: 'Сохраняемое ядро',
    sources: [
      { cardId: 'project-theory', list: 'preserve' },
      { cardId: 'target-state', list: 'preserveTargets' },
    ],
  },
  {
    id: 'management',
    title: 'Системы управления',
    sources: [
      { cardId: 'target-state', list: 'managementSystems' },
    ],
  },
];

// Элемент кластера с привязкой к источнику (origin) — нужен для инлайн-правки и перехода в карточку.
export interface ClusterMember {
  clusterId: string;
  cardId: string;
  list: string;
  item: EditableItem;
}

/** Карточки, участвующие в кластере (уникальный список cardId). */
export function clusterCardIds(spec: ClusterSpec): string[] {
  return [...new Set(spec.sources.map(s => s.cardId))];
}

/** «Первичный» источник кластера — куда уходит добавление нового элемента. */
export function primarySource(spec: ClusterSpec): ClusterSource {
  return spec.sources[0];
}

/** Все cardId, которые входят хотя бы в один кластер (для модели: их элементы показываем в кластерах). */
export const CLUSTERED_CARD_IDS = new Set(
  PROJECT_CLUSTERS.flatMap(c => c.sources.map(s => s.cardId)),
);

/** Пара (cardId,list) принадлежит какому-то кластеру? */
const CLUSTERED_LISTS = new Set(
  PROJECT_CLUSTERS.flatMap(c => c.sources.map(s => `${s.cardId}:${s.list}`)),
);
export function isClusteredList(cardId: string, list: string): boolean {
  return CLUSTERED_LISTS.has(`${cardId}:${list}`);
}
