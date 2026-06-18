import Icon from '../Icon';
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
}

export default function ProjectCanvas({ projectId, view }: ProjectCanvasProps) {
  if (view.frameworkCardId === 'project-theory') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectTheoryCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId === 'diagnosis') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectDiagnosisCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId === 'strategic-choice') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectStrategicChoiceCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId === 'target-state') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectTargetStateCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId === 'whole-project') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectWholeProjectCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId === 'okr-kpi') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectOkrCanvas key={projectId} projectId={projectId} />
      </section>
    );
  }

  if (view.frameworkCardId && [
    'strategy-map',
    'hypotheses',
    'experiments',
    'decisions',
    'initiatives',
    'business-processes',
    'tasks',
    'facts-learning',
  ].includes(view.frameworkCardId)) {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectFrameworkSectionCanvas key={`${projectId}-${view.frameworkCardId}`} projectId={projectId} screenId={view.frameworkCardId} />
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
