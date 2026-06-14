import Icon from '../Icon';
import ProjectTheoryCanvas from './ProjectTheoryCanvas';

export interface ProjectCanvasView {
  icon: string;
  title: string;
  description: string;
  frameworkCardId?: string;
}

interface ProjectCanvasProps {
  view: ProjectCanvasView;
}

export default function ProjectCanvas({ view }: ProjectCanvasProps) {
  if (view.frameworkCardId === 'project-theory') {
    return (
      <section className="project-canvas project-canvas-work">
        <ProjectTheoryCanvas />
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
