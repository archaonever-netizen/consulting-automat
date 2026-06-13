import type { Project } from '../../types/projects';
import ProjectCanvas from './ProjectCanvas';
import ProjectLeftPanel from './ProjectLeftPanel';
import ProjectRightPanel from './ProjectRightPanel';
import ProjectToolbar from './ProjectToolbar';

interface ProjectWorkspaceProps {
  project: Project;
}

export default function ProjectWorkspace({ project }: ProjectWorkspaceProps) {
  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} />
      <div className="project-workspace-grid">
        <ProjectLeftPanel project={project} />
        <ProjectCanvas />
        <ProjectRightPanel project={project} />
      </div>
    </div>
  );
}
