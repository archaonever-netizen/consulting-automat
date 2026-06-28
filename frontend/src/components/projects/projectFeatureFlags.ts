// Фиче-флаги раздела «Проекты».
//
// ВАЖНО: по умолчанию ВСЁ ВЫКЛЮЧЕНО — поведение приложения не меняется, пока флаг
// явно не включён. Это «страховка» интеграции нового инструмента гипотез
// (см. PROGRAMMING_INTEGRATION.md): новый экран прячется за флагом, старый рендер
// остаётся рабочим и доступным откатом.
//
// Флаг можно включить двумя способами:
//   • на сборку — переменная окружения, например VITE_HYPOTHESES_WORKBENCH=1;
//   • на лету в браузере — localStorage, удобно проверить на одном проекте без пересборки:
//       localStorage['project_feature_flag:hypotheses_workbench'] = 'on'
//     Локальное переопределение имеет приоритет над сборочной переменной.
import { useEffect, useState } from 'react';

export type ProjectFeatureFlag = 'hypotheses_workbench';

export const HYPOTHESES_WORKBENCH: ProjectFeatureFlag = 'hypotheses_workbench';

// Сборочная переменная окружения для каждого флага (статические ключи, чтобы Vite их подставил).
const ENV_VAR_BY_FLAG: Record<ProjectFeatureFlag, string> = {
  hypotheses_workbench: 'VITE_HYPOTHESES_WORKBENCH',
};

function flagStorageKey(flag: ProjectFeatureFlag) {
  return `project_feature_flag:${flag}`;
}

function parseBool(raw: string | undefined | null): boolean | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'on' || value === '1' || value === 'true' || value === 'yes') return true;
  if (value === 'off' || value === '0' || value === 'false' || value === 'no' || value === '') return false;
  return null;
}

// Локальное (runtime) переопределение из localStorage. null = не задано.
function readLocalOverride(flag: ProjectFeatureFlag): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseBool(window.localStorage.getItem(flagStorageKey(flag)));
  } catch {
    return null;
  }
}

// Значение по умолчанию из сборочной переменной окружения. По умолчанию — false.
function readEnvDefault(flag: ProjectFeatureFlag): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return parseBool(env?.[ENV_VAR_BY_FLAG[flag]]) ?? false;
}

/** Включён ли фиче-флаг. Локальное переопределение имеет приоритет над окружением. */
export function isFeatureEnabled(flag: ProjectFeatureFlag): boolean {
  const local = readLocalOverride(flag);
  if (local !== null) return local;
  return readEnvDefault(flag);
}

/** Задать/снять локальное переопределение флага (для проверки без пересборки). */
export function setFeatureFlagOverride(flag: ProjectFeatureFlag, value: boolean | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(flagStorageKey(flag));
    else window.localStorage.setItem(flagStorageKey(flag), value ? 'on' : 'off');
  } catch {
    /* недоступный localStorage не должен ломать работу */
  }
}

/** Удобный предикат для главного флага инструмента гипотез. */
export function isHypothesesWorkbenchEnabled(): boolean {
  return isFeatureEnabled(HYPOTHESES_WORKBENCH);
}

// Событие, по которому реактивный хук пересинхронизируется в той же вкладке
// (storage-событие срабатывает только в ДРУГИХ вкладках).
const FLAG_EVENT = 'project-feature-flags-changed';

/** Реактивный флаг инструмента гипотез: значение + сеттер, переключающий локальное переопределение. */
export function useHypothesesWorkbenchFlag(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => isHypothesesWorkbenchEnabled());
  useEffect(() => {
    const sync = () => setEnabled(isHypothesesWorkbenchEnabled());
    window.addEventListener(FLAG_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FLAG_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = (value: boolean) => {
    setFeatureFlagOverride(HYPOTHESES_WORKBENCH, value);
    setEnabled(value);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLAG_EVENT));
  };
  return [enabled, set];
}
