import ProjectMethodologist from './ProjectMethodologist';

interface ProjectRightPanelProps {
  projectId: number;
  focusCardId: string | null;
  onProjectMutated: () => void;
}

export default function ProjectRightPanel({ projectId, focusCardId, onProjectMutated }: ProjectRightPanelProps) {
  return <ProjectMethodologist projectId={projectId} focusCardId={focusCardId} onProjectMutated={onProjectMutated} />;
}
