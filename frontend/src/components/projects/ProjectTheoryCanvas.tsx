import { useMemo, useState, type ReactNode } from 'react';
import Icon from '../Icon';

type ResultCriterion = {
  id: number;
  title: string;
  type: string;
  currentValue: string;
  targetValue: string;
  controlPoints: number[];
};

const statusOptions = ['Черновик', 'Готово к проверке', 'Методологически валидно', 'Требует уточнения'];

const autoChecks = [
  'Миссия не сведена только к деньгам',
  'Указан внешний выгодоприобретатель',
  'Результат измерим',
  'Есть срок результата',
  'Есть источник проверки',
  'Компетенции связаны с результатом',
  'Ограничения включают не только срок',
  'Качество связано с результатом',
  'Есть список того, что нельзя разрушить',
];

const beneficiaryOptions = [
  'Клиенты компании',
  'Сотрудники компании',
  'Собственник / акционер',
  'Подразделение компании',
  'Партнеры',
  'Общество / сообщество',
  'Другое',
];

const roleRows = [
  ['Заказчик', 'Кто утверждает проект и принимает ключевые решения?'],
  ['Пользователь результата', 'Кто будет ежедневно пользоваться результатом?'],
  ['Экономический выгодоприобретатель', 'У кого должен улучшиться финансовый или операционный результат?'],
  ['Конечный клиент', 'На какого клиента или внешнюю группу повлияет проект?'],
  ['Пострадавшая сторона при провале', 'Кто понесет потери, если проект не будет реализован?'],
];

const resultTypes = [
  'Финансовый',
  'Клиентский',
  'Операционный',
  'Процессный',
  'Командный',
  'Инфраструктурный',
  'Качественный',
  'Рисковый',
];

const metricPeriods = ['накопительным итогом за весь проект', 'в конце проекта', 'в мес.'];

const sourceOptions = [
  'CRM',
  'Финансовый отчет',
  'Акт приемки',
  'Дашборд',
  'Опрос клиентов',
  'Отчет руководителя',
  'Аудит процесса',
  'Другое',
];

const competencyChecks = [
  'Интервью',
  'Тестовое задание',
  'Портфолио / кейсы',
  'Прошлый результат',
  'Метрика производительности',
  'Пилотная задача',
  'Аттестация',
  'Другое',
];

const competencyActions = [
  'Нанять',
  'Обучить',
  'Привлечь подрядчика',
  'Изменить scope проекта',
  'Перенести срок',
  'Отказаться от решения',
  'Другое',
];

const qualityObjectOptions = [
  'Продукт / материальный результат',
  'Услуга / сервис',
  'Операционный процесс',
  'Клиентское обслуживание',
  'Проектная работа',
  'Оборудование / инфраструктура',
  'Другое',
];

const qualityDefectOptions = [
  'Ошибка в результате',
  'Возврат результата клиентом',
  'Гарантийная претензия',
  'Повторная работа / переделка',
  'Нарушение спецификации',
  'Нарушение SLA',
  'Неточная информация',
  'Неполное выполнение запроса',
  'Недоступность услуги',
  'Жалоба клиента',
  'Финансовая потеря клиента',
  'Неадекватное отношение к клиенту',
  'Другое',
];

const qualityMetricOptions: Record<string, string[]> = {
  'Продукт / материальный результат': [
    'Дефектов на 1 000 000 единиц',
    'Процент брака',
    'Процент возвратов',
    'Количество гарантийных претензий',
    'Количество обращений по гарантийному ремонту',
    'Стоимость гарантийного ремонта',
    'Выход годной продукции',
    'Отходы',
    'Неликвиды',
    'Переработка брака',
  ],
  'Услуга / сервис': [
    'Количество обращений по гарантии услуги',
    'Стоимость компенсаций / гарантийной услуги',
    'Количество жалоб',
    'Процент повторных обращений по той же проблеме',
    'Индекс неудовлетворенности клиента',
    'Оценка клиента по шкале 1-10',
  ],
  'Операционный процесс': [
    'Процент результата, прошедшего контроль с первого раза',
    'First Pass Yield',
    'Количество переделок',
    'Доля процессов без отклонений',
    'Доля статистически контролируемых процессов',
    'Количество ошибок на этап процесса',
    'Количество дефектов на единицу результата',
  ],
  'Клиентское обслуживание': [
    'Оценка mystery shopper',
    'Процент выполненных стандартов обслуживания',
    'Оценка клиента по анкете',
    'Количество жалоб',
    'Количество нарушений стандарта',
    'Индекс удовлетворенности клиента',
  ],
  'Проектная работа': [
    'Оценка клиента по критериям проекта',
    'Средний балл по выбранным клиентом параметрам',
    'Количество замечаний клиента',
    'Количество итераций до приемки',
    'Процент этапов, принятых с первого раза',
  ],
  'Оборудование / инфраструктура': [
    'Доля оборудования с требуемой надежностью',
    'Время безотказной работы',
    'Количество отказов',
    'Среднее время от заявки на ремонт до устранения',
    'Количество повторных неисправностей',
  ],
  Другое: ['Опишите метод измерения вручную'],
};

const qualityUnits = ['%', 'шт.', 'баллы', '₽', 'часы', 'дни', 'дефектов на 1 000 000'];
const qualityDirections = ['не больше', 'не меньше', 'равно', 'в диапазоне'];
const qualitySources = [
  'CRM',
  'Система контроля качества',
  'Журнал возвратов',
  'Журнал гарантийных обращений',
  'Клиентская анкета',
  'Mystery shopper',
  'Акт приемки',
  'Внешний аудит',
  'Внутренний аудит',
  'Производственная система',
  'Сервисная система',
  'Другое',
];
const qualityFrequencies = [
  'После каждой операции',
  'Ежедневно',
  'Еженедельно',
  'Ежемесячно',
  'После каждого этапа проекта',
  'При приемке результата',
  'Другое',
];

const preserveOptions = [
  'Качество обслуживания',
  'Репутацию',
  'Доверие клиентов',
  'Управляемость процессов',
  'Культуру ответственности',
  'Ключевых сотрудников',
  'Юридическую чистоту',
  'Финансовую устойчивость',
  'Безопасность данных',
  'Другое',
];

const preservationControls = [
  'Метрика',
  'Аудит',
  'Опрос',
  'Отчет руководителя',
  'Клиентская обратная связь',
  'Юридическая проверка',
  'Финансовый контроль',
];

const validationChecks = [
  'Есть внешний или внутренний выгодоприобретатель.',
  'Миссия описывает ценность, а не только деньги.',
  'Результат содержит измеримые критерии.',
  'У каждого результата есть срок и источник проверки.',
  'Компетенции связаны с результатами.',
  'Ограничения включают срок, ресурс / бюджет и запреты.',
  'Качество связано с результатом и имеет источник контроля.',
  'Список "нельзя разрушить" содержит индикаторы контроля.',
  'Нет противоречий между миссией, результатом, качеством, компетенциями и ограничениями.',
];

function createCriterion(id: number): ResultCriterion {
  return {
    id,
    title: '',
    type: '',
    currentValue: '',
    targetValue: '',
    controlPoints: [1],
  };
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="project-theory-field">
      <span>{label}</span>
      <select
        className="form-select"
        value={value}
        defaultValue={value === undefined ? '' : undefined}
        onChange={event => onChange?.(event.target.value)}
      >
        <option value="" disabled>Выберите</option>
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SelectWithOther({ label, options }: { label: string; options: string[] }) {
  const [selected, setSelected] = useState('');

  return (
    <>
      <SelectField label={label} options={options} value={selected} onChange={setSelected} />
      {selected === 'Другое' && (
        <TextField label={`${label}: другое`} placeholder="Уточните вручную" />
      )}
    </>
  );
}

function TextField({
  label,
  placeholder = '',
  type = 'text',
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="project-theory-field">
      <span>{label}</span>
      <input
        className="form-input"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange?.(event.target.value)}
      />
    </label>
  );
}

function DateField({ label }: { label: string }) {
  return <TextField label={label} type="date" />;
}

function TextAreaField({ label, placeholder = '' }: { label: string; placeholder?: string }) {
  return (
    <label className="project-theory-field full">
      <span>{label}</span>
      <textarea className="form-textarea" rows={3} placeholder={placeholder} />
    </label>
  );
}

function ProjectTheorySection({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="project-theory-section">
      <div className="project-theory-section-head">
        <span>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function LinkedResultSelect({ label, resultNames }: { label: string; resultNames: string[] }) {
  return (
    <SelectField
      label={label}
      options={resultNames.length ? resultNames : ['Сначала укажите название результата']}
    />
  );
}

export default function ProjectTheoryCanvas() {
  const [beneficiaries, setBeneficiaries] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<ResultCriterion[]>([createCriterion(1), createCriterion(2), createCriterion(3)]);
  const [nextCriterionId, setNextCriterionId] = useState(4);
  const [qualityObject, setQualityObject] = useState('');

  const resultNames = useMemo(
    () => criteria.map((criterion, index) => criterion.title.trim() || `Критерий результата ${index + 1}`),
    [criteria],
  );
  const qualityMetricList = qualityMetricOptions[qualityObject] || [];

  function toggleBeneficiary(option: string) {
    setBeneficiaries(current => (
      current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option]
    ));
  }

  function updateCriterion(id: number, patch: Partial<ResultCriterion>) {
    setCriteria(current => current.map(criterion => {
      if (criterion.id !== id) return criterion;
      const next = { ...criterion, ...patch };
      if (patch.type === 'Процессный') {
        next.currentValue = 'отсутствует';
        next.targetValue = 'Реализовано в процесс';
      }
      return next;
    }));
  }

  function addCriterion() {
    setCriteria(current => [...current, createCriterion(nextCriterionId)]);
    setNextCriterionId(current => current + 1);
  }

  function addControlPoint(criterionId: number) {
    setCriteria(current => current.map(criterion => {
      if (criterion.id !== criterionId) return criterion;
      const lastPoint = criterion.controlPoints[criterion.controlPoints.length - 1] || 0;
      return { ...criterion, controlPoints: [...criterion.controlPoints, lastPoint + 1] };
    }));
  }

  return (
    <div className="project-theory">
      <div className="project-theory-hero">
        <div>
          <div className="eyebrow">Фреймворк проекта</div>
          <h2>Теория проекта</h2>
          <p>
            Проверяемая модель: для кого проект создает ценность, какой результат должен возникнуть,
            за счет каких компетенций, в каких границах и что нельзя повредить.
          </p>
        </div>
        <label className="project-theory-status">
          <span>Статус заполнения</span>
          <select className="form-select" defaultValue="Черновик">
            {statusOptions.map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>

      <div className="project-theory-checks" aria-label="Автопроверки">
        {autoChecks.map((check, index) => (
          <span className={`pill ${index < 2 ? 'pill-blue' : 'pill-gray'}`} key={check}>
            <span className="led" />
            {check}
          </span>
        ))}
      </div>

      <ProjectTheorySection
        number="1"
        title="Миссия проекта"
        note="Фиксирует ценность и выгодоприобретателя. Деньги могут быть результатом, но не единственным смыслом проекта."
      >
        <div className="project-theory-grid two">
          <div className="project-theory-field full">
            <span>Для кого проект создает ценность?</span>
            <div className="project-theory-check-list">
              {beneficiaryOptions.map(option => (
                <label className="project-theory-check-option" key={option}>
                  <input
                    type="checkbox"
                    checked={beneficiaries.includes(option)}
                    onChange={() => toggleBeneficiary(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
          {beneficiaries.includes('Другое') && (
            <TextField label="Для кого: другое" placeholder="Уточните группу выгодоприобретателей" />
          )}
          <TextField label="Уточнение роли / группы" placeholder="Например: клиенты ЮФО" />
          <TextAreaField
            label="Какую проблему или потребность проект должен решить?"
            placeholder="Снизить перегрузку центральной команды и ускорить обработку заявок клиентов ЮФО."
          />
          <TextAreaField
            label="Какое полезное изменение должно произойти?"
            placeholder="Что изменится в работе, состоянии или результате выгодоприобретателя после проекта?"
          />
          <TextAreaField
            label="Формулировка миссии"
            placeholder="Проект существует для того, чтобы [выгодоприобретатель] получил [ценность], за счет [изменение в системе], что позволит [эффект]."
          />
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="2"
        title="Клиент / выгодоприобретатель"
        note="Разделяет роли: кто платит, кто использует результат, кто получает эффект и на кого влияет проект."
      >
        <div className="project-theory-table">
          {roleRows.map(([role, question]) => (
            <div className="project-theory-table-row three" key={role}>
              <b>{role}</b>
              <span>{question}</span>
              <input className="form-input" type="text" placeholder="Роль, команда или группа" />
            </div>
          ))}
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="3"
        title="Критерии результата"
        note="Каждый результат должен быть измеримым, проверяемым и ограниченным сроком."
      >
        <div className="project-theory-repeater">
          {criteria.map((criterion, index) => (
            <div className="project-theory-card" key={criterion.id}>
              <div className="project-theory-card-title">Критерий результата {index + 1}</div>
              <div className="project-theory-grid four">
                <TextField
                  label="Название результата"
                  value={criterion.title}
                  onChange={value => updateCriterion(criterion.id, { title: value })}
                />
                <SelectField
                  label="Тип результата"
                  options={resultTypes}
                  value={criterion.type}
                  onChange={value => updateCriterion(criterion.id, { type: value })}
                />
                <TextField label="Метрика: название" placeholder="Например: обработанные заявки" />
                <TextField label="Метрика: количество" type="number" />
                <TextField label="Метрика: единица измерения" placeholder="шт., %, ₽, дни" />
                <SelectField label="Период метрики" options={metricPeriods} />
                <TextField
                  label="Текущее значение"
                  value={criterion.currentValue}
                  onChange={value => updateCriterion(criterion.id, { currentValue: value })}
                />
                <TextField
                  label="Целевое значение"
                  value={criterion.targetValue}
                  onChange={value => updateCriterion(criterion.id, { targetValue: value })}
                />
                <DateField label="Дата старта" />
                <DateField label="Дата завершения" />
                <SelectField label="Источник проверки" options={sourceOptions} />
                <TextField label="Кто принимает результат" />
              </div>
              <div className="project-theory-subblock">
                <div className="project-theory-subhead">
                  <b>Контрольные точки</b>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => addControlPoint(criterion.id)}>
                    <Icon name="plus" size={14} />
                    Добавить точку
                  </button>
                </div>
                <div className="project-theory-grid three">
                  {criterion.controlPoints.map((point, pointIndex) => (
                    <DateField label={`Контрольная точка ${pointIndex + 1}`} key={point} />
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button className="project-theory-add-card" type="button" onClick={addCriterion}>
            <Icon name="plus" size={16} />
            Добавить критерий результата
          </button>
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="4"
        title="Ключевые компетенции"
        note="Компетенция описывает способность, без которой проект не сможет дать заявленный результат."
      >
        <div className="project-theory-repeater">
          {[1, 2].map(index => (
            <div className="project-theory-card" key={index}>
              <div className="project-theory-card-title">Компетенция {index}</div>
              <div className="project-theory-grid three">
                <TextField label="Компетенция" placeholder="Например: продажа B2B-услуг" />
                <TextField label="Зачем нужна" />
                <LinkedResultSelect label="Связанный результат" resultNames={resultNames} />
                <TextField label="Носитель компетенции" placeholder="Роль / человек / команда" />
                <TextField label="Минимальный достаточный уровень" />
                <SelectWithOther label="Как проверяем наличие" options={competencyChecks} />
                <SelectWithOther label="Если компетенции нет" options={competencyActions} />
              </div>
            </div>
          ))}
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="5"
        title="Ограничения"
        note="Задает границы, внутри которых результат должен быть достигнут. Не только сроки."
      >
        <div className="project-theory-grid three">
          <LinkedResultSelect label="Ключевой результат, к которому относятся ограничения" resultNames={resultNames} />
          <DateField label="Дата старта ограничения" />
          <DateField label="Дата завершения ограничения" />
          <TextField label="Максимальный бюджет" />
          <SelectWithOther label="Валюта" options={['RUB', 'USD', 'EUR', 'Другое']} />
          <TextField label="Допустимое отклонение, %" />
        </div>

        <div className="project-theory-grid three">
          <TextField label="Доступные роли" placeholder="Роли через запятую" />
          <TextField label="Недоступные роли / ресурсы" />
          <TextField label="Максимальная загрузка ключевого лица" placeholder="Часов в неделю" />
          <TextAreaField
            label="Запреты"
            placeholder="Что запрещено делать ради достижения результата?"
          />
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="6"
        title="Качество"
        note="Качество описывает норму результата: что считается дефектом, как это измеряется, где берется факт и кто отвечает за отклонения."
      >
        <div className="project-theory-quality standalone">
          <div className="project-theory-subhead">
            <b>Показатель качества результата</b>
            <span>Показатель качества должен быть связан с конкретным результатом проекта.</span>
          </div>
          <div className="project-theory-grid three">
            <LinkedResultSelect label="Результат, к которому относится качество" resultNames={resultNames} />
            <SelectField
              label="6.1 Объект качества"
              options={qualityObjectOptions}
              value={qualityObject}
              onChange={setQualityObject}
            />
            {qualityObject === 'Другое' && (
              <TextField label="Объект качества: другое" placeholder="Уточните объект качества" />
            )}
            <TextAreaField
              label="6.2 Требование клиента или спецификация"
              placeholder="Заявка клиента должна быть обработана без ошибки в данных, в полном объеме и в установленный SLA."
            />
            <div className="project-theory-field full">
              <span>6.3 Тип дефекта</span>
              <div className="project-theory-check-list dense">
                {qualityDefectOptions.map(option => (
                  <label className="project-theory-check-option" key={option}>
                    <input type="checkbox" />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
            <SelectField
              label="6.4 Метод измерения качества"
              options={qualityMetricList.length ? qualityMetricList : ['Сначала выберите объект качества']}
            />
            <TextAreaField
              label="6.5 Формула / способ расчета"
              placeholder="Процент возвратов = количество возвратов / количество проданных единиц x 100%"
            />
            <TextField label="6.6 Целевое значение" type="number" />
            <SelectField label="Единица" options={qualityUnits} />
            <SelectField label="Направление нормы" options={qualityDirections} />
            <SelectWithOther label="6.7 Источник контроля" options={qualitySources} />
            <SelectWithOther label="6.8 Частота контроля" options={qualityFrequencies} />
            <TextField label="6.9 Владелец качества" placeholder="Роль или пользователь" />
          </div>
        </div>
      </ProjectTheorySection>

      <ProjectTheorySection
        number="7"
        title="Что нельзя разрушить"
        note="Фиксирует ядро, которое должно сохраниться при изменениях."
      >
        <div className="project-theory-repeater">
          {[1, 2].map(index => (
            <div className="project-theory-card" key={index}>
              <div className="project-theory-card-title">Сохраняемое ядро {index}</div>
              <div className="project-theory-grid three">
                <SelectWithOther label="Что сохраняем" options={preserveOptions} />
                <TextField label="Почему это критично" />
                <TextField label="Индикатор сохранности" />
                <TextField label="Минимально допустимый уровень" />
                <SelectField label="Как контролируем" options={preservationControls} />
                <TextField label="Запрещенные действия" />
              </div>
            </div>
          ))}
        </div>
      </ProjectTheorySection>

      <section className="project-theory-validation">
        <div>
          <div className="project-panel-title">Проверка теории проекта</div>
          <h3>Готовность модели</h3>
          <p>Экран считается заполненным только когда каждый блок можно проверить фактом, цифрой, ролью или источником данных.</p>
        </div>
        <div className="project-theory-validation-grid">
          {validationChecks.map(check => (
            <label className="project-theory-validation-item" key={check}>
              <input type="checkbox" />
              <span>{check}</span>
            </label>
          ))}
        </div>
        <label className="project-theory-field compact">
          <span>Итоговый статус проверки</span>
          <select className="form-select" defaultValue="Не заполнено">
            {['Не заполнено', 'Заполнено частично', 'Есть методологические ошибки', 'Готово к следующему экрану'].map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}
