// Кэш результата ИИ-валидатора в localStorage. Общий для ProjectCardValidator
// (запись после проверки + чтение при открытии) и projectCardSync (запись при
// гидрации из БД). Без сторонних импортов — переиспользуется в обе стороны.

export type Verdict = 'valid' | 'partial' | 'invalid' | 'no_evidence';

export interface EvidenceRef {
  source_key: string | null;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  card_type: string | null;
}

export interface ValidationResult {
  answer: string;
  verdict: Verdict;
  evidence: EvidenceRef[];
  contentHash: string;
  checkedAt: string;
}

export function validationCacheKey(projectId: number, cardId: string) {
  return `project_card_validation:${projectId}:${cardId}`;
}

export function readValidationCache(projectId: number, cardId: string): ValidationResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(validationCacheKey(projectId, cardId));
    return raw ? (JSON.parse(raw) as ValidationResult) : null;
  } catch {
    return null;
  }
}

export function writeValidationCache(projectId: number, cardId: string, result: ValidationResult) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(validationCacheKey(projectId, cardId), JSON.stringify(result));
  } catch {
    /* переполнение localStorage не должно ломать UI */
  }
}
