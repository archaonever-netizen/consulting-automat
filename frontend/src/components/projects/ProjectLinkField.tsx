// Общий пикер прямой связи: выбор реального элемента другой карточки.
// Хранит составной id (value), показывает метку. Пустое значение = связь не задана.
// Старое «свободное» значение (текст / удалённый элемент) не теряем — показываем как есть.
import type { RefOption } from './projectCrossRefs';

export default function ProjectLinkField({
  label,
  value,
  options,
  onChange,
  placeholder = '— не связано —',
}: {
  label: string;
  value: string;
  options: RefOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const known = options.some(o => o.value === value);
  return (
    <label className="project-theory-field project-link-field">
      <span>{label}</span>
      <select className="form-select" value={known ? value : ''} onChange={event => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
