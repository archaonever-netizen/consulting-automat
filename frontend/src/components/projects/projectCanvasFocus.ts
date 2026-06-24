import { useEffect, useRef } from 'react';

// Центрирование канваса на конкретном объекте после перехода с графа «Весь проект»
// (двойной клик по узлу → открыть раздел И прокрутить к карточке/блоку, подсветив её).
//
// Каждая карточка-объект помечается data-focus-id = `cardId::list::itemId` (см. focusKey),
// блок — префиксом `cardId::list::`. Хук находит лучший матч и скроллит к нему.

export const FOCUS_SEP = '::';

// Стабильный ключ якоря объекта/блока для атрибута data-focus-id.
export function focusKey(cardId: string, list?: string, itemId?: string): string {
  return [cardId, list, itemId].filter(part => part != null && part !== '').join(FOCUS_SEP);
}

// Цель центрирования: раздел (cardId) + опционально блок (list) и элемент (itemId).
// nonce форсирует повторный скролл даже при двойном клике по тому же объекту.
export interface CanvasFocusTarget {
  cardId: string;
  list?: string;
  itemId?: string;
  nonce: number;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

// Возвращает ref на контейнер канваса. При смене target скроллит к нужному
// data-focus-id внутри контейнера и кратко подсвечивает его (.is-focus-flash).
export function useCanvasFocus<T extends HTMLElement>(target: CanvasFocusTarget | null | undefined) {
  const ref = useRef<T>(null);

  useEffect(() => {
    // Скроллим только когда указан блок (или элемент). Раздел/корень без блока
    // открывается сверху — это и есть «центр» для них.
    if (!target || !target.list) return;
    const root = ref.current;
    if (!root) return;

    const exact = target.itemId ? focusKey(target.cardId, target.list, target.itemId) : null;
    const blockPrefix = `${focusKey(target.cardId, target.list)}${FOCUS_SEP}`;

    const find = (): HTMLElement | null => {
      if (exact) {
        const el = root.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(exact)}"]`);
        if (el) return el;
      }
      // Блок свёрнут на графе (нет точного элемента) → ведём к первому объекту списка.
      return root.querySelector<HTMLElement>(`[data-focus-id^="${cssEscape(blockPrefix)}"]`);
    };

    let frame = 0;
    let attempts = 0;
    let flashTimer = 0;
    const tick = () => {
      const el = find();
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('is-focus-flash');
        void el.offsetWidth; // рефлоу — перезапустить анимацию, если класс уже был
        el.classList.add('is-focus-flash');
        flashTimer = window.setTimeout(() => el.classList.remove('is-focus-flash'), 2000);
        return;
      }
      // Канвас мог ещё не смонтировать карточки — ждём несколько кадров.
      if (attempts++ < 40) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      if (flashTimer) window.clearTimeout(flashTimer);
    };
  }, [target]);

  return ref;
}
