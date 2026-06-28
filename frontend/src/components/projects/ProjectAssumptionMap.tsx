import { Fragment, type DragEvent } from 'react';
import { NAME_KEY, type RecordState, type ScreenConfig } from './ProjectFrameworkSectionCanvas';
import { evaluateHypothesisQuality } from './projectHypothesisQuality';
import {
  MAP_LEVELS,
  type MapLevel,
  recordsInCell,
  unassignedRecords,
} from './projectHypothesisMap';
import { type StrategyElement } from './projectHypothesisCoverage';

// Линза «Карта допущений» (Этап 3). Раскладывает гипотезы по осям важность × неизвестность.
// Перетаскивание чипа на клетку проставляет обе оси; клик по чипу открывает его в реестре.

const COL_LABEL: Record<MapLevel, string> = {
  высокая: 'много не знаем',
  средняя: 'частично знаем',
  низкая: 'знаем',
};
const ROW_LABEL: Record<MapLevel, string> = {
  высокая: 'важно',
  средняя: 'средне',
  низкая: 'неважно',
};

function recordLabel(record: RecordState, config: ScreenConfig): string {
  return record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || 'Без названия';
}

export default function ProjectAssumptionMap({
  records,
  config,
  blindZones,
  onAssign,
  onSelect,
}: {
  records: RecordState[];
  config: ScreenConfig;
  blindZones: StrategyElement[];
  onAssign: (id: number, importance: MapLevel, uncertainty: MapLevel) => void;
  onSelect: (id: number) => void;
}) {
  const unassigned = unassignedRecords(records);

  const handleDragStart = (event: DragEvent, id: number) => {
    event.dataTransfer.setData('text/plain', String(id));
    event.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = (event: DragEvent, importance: MapLevel, uncertainty: MapLevel) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    if (id) onAssign(id, importance, uncertainty);
  };

  const renderChip = (record: RecordState) => {
    const quality = evaluateHypothesisQuality(record.values);
    return (
      <button
        key={record.id}
        type="button"
        className="hyp-map-chip"
        draggable
        onDragStart={event => handleDragStart(event, record.id)}
        onClick={() => onSelect(record.id)}
        title="Перетащите на поле, или нажмите, чтобы открыть"
      >
        <span className={`hyp-dot ${quality.level}`} aria-hidden />
        <span className="hyp-map-chip-label">{recordLabel(record, config)}</span>
      </button>
    );
  };

  return (
    <div className="hyp-map">
      <div className="hyp-map-grid">
        <div className="hyp-map-corner">
          <span>важность ↑</span>
          <span>знание →</span>
        </div>
        {MAP_LEVELS.map(uncertainty => (
          <div className="hyp-map-colhead" key={`col-${uncertainty}`}>{COL_LABEL[uncertainty]}</div>
        ))}

        {MAP_LEVELS.map(importance => (
          <Fragment key={`row-${importance}`}>
            <div className="hyp-map-rowhead">{ROW_LABEL[importance]}</div>
            {MAP_LEVELS.map(uncertainty => {
              const top = importance === 'высокая' && uncertainty === 'высокая';
              const cellRecords = recordsInCell(records, importance, uncertainty);
              return (
                <div
                  key={`${importance}-${uncertainty}`}
                  className={`hyp-map-cell${top ? ' is-top' : ''}`}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => handleDrop(event, importance, uncertainty)}
                >
                  {top && <span className="hyp-map-cell-tag">проверять первым</span>}
                  {cellRecords.map(renderChip)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="hyp-map-tray">
        <div className="hyp-map-tray-head">
          Не оценено{unassigned.length ? ` (${unassigned.length})` : ''}
          <em>перетащите на поле, чтобы оценить важность и неизвестность</em>
        </div>
        <div className="hyp-map-tray-chips">
          {unassigned.length === 0
            ? <span className="hyp-map-tray-empty">Все гипотезы размещены на карте.</span>
            : unassigned.map(renderChip)}
        </div>
      </div>

      {blindZones.length > 0 && (
        <div className="hyp-map-blind">
          <div className="hyp-map-blind-head">⚠ Слепые зоны — не покрыты ни одной гипотезой</div>
          <div className="hyp-map-blind-chips">
            {blindZones.map(zone => (
              <span className="hyp-map-blind-chip" key={`${zone.kind}-${zone.label}`}>
                <em>{zone.kind}</em> {zone.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
