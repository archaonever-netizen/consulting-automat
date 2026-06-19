// Лист-модуль: дебаунс-отправка содержимого карточки на сервер.
// Зависит только от api — снапшот-модули импортируют отсюда pushCardSnapshot,
// поэтому здесь НЕ должно быть импортов из снапшот-модулей (иначе цикл).
import api from '../../services/api';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const SYNC_DELAY = 600;

function key(projectId: number, cardId: string) {
  return `${projectId}:${cardId}`;
}

/**
 * Сохранить содержимое карточки в БД (PUT), с дебаунсом на (project, card).
 * Ошибки сети глушим: localStorage остаётся источником для редактирования,
 * синхронизация — best-effort и не должна ломать ввод.
 */
export function pushCardSnapshot(projectId: number, cardId: string, snapshot: unknown) {
  if (!projectId || !cardId) return;
  const k = key(projectId, cardId);
  const existing = timers.get(k);
  if (existing) clearTimeout(existing);
  timers.set(
    k,
    setTimeout(() => {
      timers.delete(k);
      api
        .put(`/api/projects/${projectId}/cards/${encodeURIComponent(cardId)}`, { content: snapshot })
        .catch(() => {
          /* best-effort синхронизация; ошибку показывать не нужно */
        });
    }, SYNC_DELAY),
  );
}
