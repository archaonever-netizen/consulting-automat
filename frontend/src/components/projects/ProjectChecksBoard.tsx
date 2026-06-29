import { type DragEvent } from 'react';
import { NAME_KEY, type RecordState, type ScreenConfig } from './ProjectFrameworkSectionCanvas';
import {
  CHECK_STAGES,
  checkStatusLevel,
  gateFor,
  gateHint,
  recordsInStage,
  type CheckStage,
} from './projectCheckStage';

// Вид «Доска» инструмента «Проверки» (Этап C). Канбан-дорожка этапов проверки с воротами:
// перетаскивание карточки в колонку меняет этап, но переход блокируется, если не выполнены
// требования (см. gateFor). Клик по карточке открывает её в виде «Карточка». Зеркало
// ProjectHypothesisPipeline, но по этапам проверки, а не жизненного цикла гипотезы.

export interface BlockedMove {
  label: string;
  stageLabel: string;
  missing: string[];
}

function recordLabel(record: RecordState, config: ScreenConfig): string {
  return record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || 'Без названия';
}

export default function ProjectChecksBoard({
  records,
  config,
  onAdvance,
  onBlocked,
  onSelect,
}: {
  records: RecordState[];
  config: ScreenConfig;
  onAdvance: (id: number, stage: CheckStage) => void;
  onBlocked: (move: BlockedMove) => void;
  onSelect: (id: number) => void;
}) {
  const handleDragStart = (event: DragEvent, id: number) => {
    event.dataTransfer.setData('text/plain', String(id));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: DragEvent, stage: CheckStage, stageLabel: string) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    if (!id) return;
    const record = records.find(item => item.id === id);
    if (!record) return;
    const gate = gateFor(stage, record.values);
    if (gate.ok) {
      onAdvance(id, stage);
    } else {
      onBlocked({ label: recordLabel(record, config), stageLabel, missing: gate.missing });
    }
  };

  const renderChip = (record: RecordState) => (
    <button
      key={record.id}
      type="button"
      className="hyp-pipe-chip"
      draggable
      onDragStart={event => handleDragStart(event, record.id)}
      onClick={() => onSelect(record.id)}
      title="Перетащите в колонку, или нажмите, чтобы открыть"
    >
      <span className={`hyp-dot ${checkStatusLevel(record)}`} aria-hidden />
      <span className="hyp-pipe-chip-label">{recordLabel(record, config)}</span>
    </button>
  );

  return (
    <div className="hyp-pipe">
      {CHECK_STAGES.map(stage => {
        const stageRecords = recordsInStage(records, stage.key);
        const hint = gateHint(stage.key);
        return (
          <div
            key={stage.key}
            className="hyp-pipe-col"
            onDragOver={event => event.preventDefault()}
            onDrop={event => handleDrop(event, stage.key, stage.label)}
          >
            <div className="hyp-pipe-col-head">
              <span className="hyp-pipe-col-title">{stage.label}</span>
              <span className="hyp-pipe-col-count">{stageRecords.length}</span>
            </div>
            {hint && <div className="hyp-pipe-gate">⚠ {hint}</div>}
            <div className="hyp-pipe-col-body">
              {stageRecords.map(renderChip)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
