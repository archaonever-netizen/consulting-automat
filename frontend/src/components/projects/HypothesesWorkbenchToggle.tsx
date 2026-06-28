// Небольшой переключатель «новый экран гипотез ↔ старая форма» (Этап 6, доделка UX).
// Презентационный: состояние и сохранение флага держит родитель (ProjectCanvas) через
// useHypothesesWorkbenchFlag — чтобы переключение мгновенно перерисовывало канвас.

export default function HypothesesWorkbenchToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="hyp-flag-toggle">
      <span className="hyp-flag-toggle-label">
        {enabled ? 'Новый инструмент гипотез' : 'Старая форма гипотез'}
        <em>бета</em>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`hyp-flag-switch${enabled ? ' is-on' : ''}`}
        onClick={() => onToggle(!enabled)}
      >
        <span className="hyp-flag-switch-knob" />
      </button>
    </div>
  );
}
