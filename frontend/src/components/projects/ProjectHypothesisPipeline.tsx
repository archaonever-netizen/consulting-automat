import { type DragEvent } from 'react';
import { NAME_KEY, type RecordState, type ScreenConfig } from './ProjectFrameworkSectionCanvas';
import { evaluateHypothesisQuality } from './projectHypothesisQuality';
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  gateFor,
  gateHint,
  recordsInStage,
} from './projectHypothesisLifecycle';

// Линза «Конвейер» (Этап 4). Канбан-дорожка жизненного цикла гипотезы с воротами:
// перетаскивание карточки в колонку меняет этап, но переход блокируется, если не заполнены
// обязательные поля (см. gateFor). Клик по карточке открывает её в реестре.

export interface BlockedMove {
  label: string;
  stageLabel: string;
  missing: string[];
}

function recordLabel(record: RecordState, config: ScreenConfig): string {
  return record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || 'Без названия';
}

export default function ProjectHypothesisPipeline({
  records,
  config,
  onAdvance,
  onBlocked,
  onSelect,
}: {
  records: RecordState[];
  config: ScreenConfig;
  onAdvance: (id: number, stage: LifecycleStage) => void;
  onBlocked: (move: BlockedMove) => void;
  onSelect: (id: number) => void;
}) {
  const handleDragStart = (event: DragEvent, id: number) => {
    event.dataTransfer.setData('text/plain', String(id));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: DragEvent, stage: LifecycleStage, stageLabel: string) => {
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

  const renderChip = (record: RecordState) => {
    const quality = evaluateHypothesisQuality(record.values);
    return (
      <button
        key={record.id}
        type="button"
        className="hyp-pipe-chip"
        draggable
        onDragStart={event => handleDragStart(event, record.id)}
        onClick={() => onSelect(record.id)}
        title="Перетащите в колонку, или нажмите, чтобы открыть"
      >
        <span className={`hyp-dot ${quality.level}`} aria-hidden />
        <span className="hyp-pipe-chip-label">{recordLabel(record, config)}</span>
      </button>
    );
  };

  return (
    <div className="hyp-pipe">
      {LIFECYCLE_STAGES.map(stage => {
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
