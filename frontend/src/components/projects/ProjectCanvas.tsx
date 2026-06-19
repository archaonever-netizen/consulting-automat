import type { ReactNode } from 'react';
import Icon from '../Icon';
import ProjectCardValidator from './ProjectCardValidator';
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

function renderCanvasBody(projectId: number, frameworkCardId: string, nonce: number): ReactNode {
  const k = `${projectId}:${nonce}`;
  if (frameworkCardId === 'project-theory') return <ProjectTheoryCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'diagnosis') return <ProjectDiagnosisCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'strategic-choice') return <ProjectStrategicChoiceCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'target-state') return <ProjectTargetStateCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'whole-project') return <ProjectWholeProjectCanvas key={k} projectId={projectId} />;
  if (frameworkCardId === 'okr-kpi') return <ProjectOkrCanvas key={k} projectId={projectId} />;
  if (SECTION_CARD_IDS.includes(frameworkCardId)) {
    return <ProjectFrameworkSectionCanvas key={`${projectId}-${frameworkCardId}:${nonce}`} projectId={projectId} screenId={frameworkCardId} />;
  }
  return null;
}

export default function ProjectCanvas({ projectId, view, reloadNonce = 0 }: ProjectCanvasProps) {
  const cardId = view.frameworkCardId;
  const body = cardId ? renderCanvasBody(projectId, cardId, reloadNonce) : null;

  if (cardId && body) {
    return (
      <section className="project-canvas project-canvas-work">
        {body}
        <ProjectCardValidator projectId={projectId} cardId={cardId} cardTitle={view.title} />
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
