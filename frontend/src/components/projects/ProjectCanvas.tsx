import Icon from '../Icon';

export default function ProjectCanvas() {
  return (
    <section className="project-canvas">
      <div className="project-canvas-empty">
        <div className="ei"><Icon name="template" size={24} /></div>
        <b>Рабочая зона проекта</b>
        <span>Здесь появятся схемы, артефакты проектирования и сценарии работы команды.</span>
      </div>
    </section>
  );
}
