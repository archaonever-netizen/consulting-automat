import type { ReactNode } from 'react';
import Icon from '../Icon';
import { useCanvasFocus, type CanvasFocusTarget } from './projectCanvasFocus';
import ProjectDiagnosisCanvas from './ProjectDiagnosisCanvas';
import ProjectFrameworkSectionCanvas from './ProjectFrameworkSectionCanvas';
import ProjectOkrCanvas from './ProjectOkrCanvas';
import ProjectStrategicChoiceCanvas from './ProjectStrategicChoiceCanvas';
import ProjectTargetStateCanvas from './ProjectTargetStateCanvas';
import ProjectTheoryCanvas from './ProjectTheoryCanvas';
import ProjectWholeProjectCanvas from './ProjectWholeProjectCanvas';

export interface ProjectCanvasView {
  icon: string;
  title: string;
  description: string;
  frameworkCardId?: string;
}

interface ProjectCanvasProps {
  projectId: number;
  view: ProjectCanvasView;
  // Меняется после применённой Методологом правки — форсирует перечтение снапшота канвасом.
  reloadNonce?: number;
  // Открыть каркасную карточку по id (граф зависимостей на «Весь проект» → клик по узлу).
  onSelectFrameworkCard?: (cardId: string) => void;
  // Центрировать открытый раздел на блоке/элементе (двойной клик по узлу графа).
  focusTarget?: CanvasFocusTarget | null;
}

const SECTION_CARD_IDS = [
  'strategy-map',
  'hypotheses',
  'experiments',
  'decisions',
  'initiatives',
  'business-processes',
  'tasks',
  'facts-learning',
];

function renderCanvasBody(
  projectId: number,
  frameworkCardId: string,
  nonce: number,
  onSelectFrameworkCard?: (cardId: string) => void,
): ReactNode {
  const k = `${projectId}:${nonce}`;
  if (frameworkCardId === 'project-theory') return <ProjectTheoryCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'diagnosis') return <ProjectDiagnosisCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'strategic-choice') return <ProjectStrategicChoiceCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'target-state') return <ProjectTargetStateCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'whole-project') return <ProjectWholeProjectCanvas key={k} projectId={projectId} onSelectCard={onSelectFrameworkCard} />;
  if (frameworkCardId === 'okr-kpi') return <ProjectOkrCanvas key={k} projectId={projectId} />;
  if (SECTION_CARD_IDS.includes(frameworkCardId)) {
    return <ProjectFrameworkSectionCanvas key={`${projectId}-${frameworkCardId}:${nonce}`} projectId={projectId} screenId={frameworkCardId} />;
  }
  return null;
}

export default function ProjectCanvas({ projectId, view, reloadNonce = 0, onSelectFrameworkCard, focusTarget }: ProjectCanvasProps) {
  const cardId = view.frameworkCardId;
  const body = cardId ? renderCanvasBody(projectId, cardId, reloadNonce, onSelectFrameworkCard) : null;
  const focusRef = useCanvasFocus<HTMLElement>(focusTarget);

  if (cardId && body) {
    return (
      <section className="project-canvas project-canvas-work" ref={focusRef}>
        {body}
      </section>
    );
  }

  return (
    <section className="project-canvas">
      <div className="project-canvas-empty">
        <div className="ei"><Icon name={view.icon} size={24} /></div>
        <b>{view.title}</b>
        <span>{view.description}</span>
        <span>Контент раздела будет добавлен позже.</span>
      </div>
    </section>
  );
}
