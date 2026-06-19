// Гидрация состояния карточек проекта из БД в localStorage.
// Вызывается один раз при открытии проекта ДО монтирования канвасов, чтобы
// они инициализировали состояние уже из серверных данных (БД — источник правды,
// localStorage — буфер редактирования).
import api from '../../services/api';
import { getProjectDiagnosisSnapshotKey } from './projectDiagnosisSnapshot';
import { getProjectFrameworkSectionSnapshotKey } from './projectFrameworkSectionSnapshot';
import { getProjectStrategicChoiceSnapshotKey } from './projectStrategicChoiceSnapshot';
import { getProjectTargetStateSnapshotKey } from './projectTargetStateSnapshot';
import { getProjectTheorySnapshotKey } from './projectTheorySnapshot';
import {
  validationCacheKey,
  type ValidationResult,
} from './projectCardValidationCache';

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

// localStorage-ключ содержимого карточки (там, где у карточки есть свой снапшот).
function contentKey(projectId: number, cardId: string): string | null {
  switch (cardId) {
    case 'project-theory':
      return getProjectTheorySnapshotKey(projectId);
    case 'diagnosis':
      return getProjectDiagnosisSnapshotKey(projectId);
    case 'strategic-choice':
      return getProjectStrategicChoiceSnapshotKey(projectId);
    case 'target-state':
      return getProjectTargetStateSnapshotKey(projectId);
    default:
      if (SECTION_CARD_IDS.has(cardId)) return getProjectFrameworkSectionSnapshotKey(projectId, cardId);
      return null; // whole-project и пр. собственного хранения не имеют
  }
}

interface ServerCard {
  card_id: string;
  content: unknown;
  validation: ValidationResult | null;
}

/**
 * Загрузить состояния карточек проекта из БД и записать в localStorage.
 * Возвращает Promise, который резолвится после гидрации (даже при ошибке сети —
 * тогда работаем на том, что уже есть в localStorage).
 */
export async function hydrateProjectCards(projectId: number): Promise<void> {
  if (typeof window === 'undefined' || !projectId) return;
  let cards: ServerCard[] = [];
  try {
    const { data } = await api.get(`/api/projects/${projectId}/cards`);
    cards = Array.isArray(data) ? (data as ServerCard[]) : [];
  } catch {
    return; // офлайн / ошибка — оставляем локальные данные как есть
  }

  for (const card of cards) {
    if (card.content != null) {
      const lsKey = contentKey(projectId, card.card_id);
      if (lsKey) {
        try {
          window.localStorage.setItem(lsKey, JSON.stringify(card.content));
        } catch {
          /* переполнение localStorage не должно ломать гидрацию */
        }
      }
    }
    if (card.validation) {
      try {
        window.localStorage.setItem(
          validationCacheKey(projectId, card.card_id),
          JSON.stringify(card.validation),
        );
      } catch {
        /* ignore */
      }
    }
  }
}
