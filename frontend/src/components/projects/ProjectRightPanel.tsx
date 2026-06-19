import ProjectMethodologist from './ProjectMethodologist';

interface ProjectRightPanelProps {
  projectId: number;
  onProjectMutated: () => void;
}

export default function ProjectRightPanel({ projectId, onProjectMutated }: ProjectRightPanelProps) {
  return <ProjectMethodologist projectId={projectId} onProjectMutated={onProjectMutated} />;
}
