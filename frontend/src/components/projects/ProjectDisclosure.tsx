import type { ReactNode } from 'react';
import Icon from '../Icon';

interface ProjectDisclosureProps {
  // Заголовок складного блока (например, «Контекст — откуда берутся данные»).
  title: string;
  // Необязательный счётчик справа в шапке (например, «3 из 6»).
  count?: string;
  // По умолчанию блок закрыт; true — раскрыть при монтировании.
  defaultOpen?: boolean;
  children: ReactNode;
}

// Складной блок методологии (контекст / проверка готовности). Прячет вспомогательную
// методологию под клик, чтобы рабочие формы оставались в фокусе. Стили — .project-disclosure.
export default function ProjectDisclosure({ title, count, defaultOpen = false, children }: ProjectDisclosureProps) {
  return (
    <details className="project-disclosure" open={defaultOpen || undefined}>
      <summary>
        <Icon name="chevron" size={14} className="project-disclosure-chevron" />
        <span>{title}</span>
        {count && <span className="project-disclosure-count">{count}</span>}
      </summary>
      <div className="project-disclosure-body">{children}</div>
    </details>
  );
}
