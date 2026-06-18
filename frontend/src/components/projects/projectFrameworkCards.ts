export interface ProjectFrameworkCard {
  id: string;
  title: string;
  description: string;
  order: number;
}

export const PROJECT_FRAMEWORK_CARDS: ProjectFrameworkCard[] = [
  {
    id: 'project-theory',
    title: 'Теория проекта',
    description: 'Как проект создает ценность, для кого он существует и какой результат должен быть достигнут.',
    order: 1,
  },
  {
    id: 'diagnosis',
    title: 'Диагноз',
    description: 'Реальная проблема, ограничение или причина, из-за которой проект необходим.',
    order: 2,
  },
  {
    id: 'strategic-choice',
    title: 'Стратегический выбор',
    description: 'Где играем, как выигрываем, какие способности и системы управления нужны.',
    order: 3,
  },
  {
    id: 'target-state',
    title: 'Целевое состояние',
    description: 'Как должна выглядеть система после успешного завершения проекта.',
    order: 4,
  },
  {
    id: 'strategy-map',
    title: 'Стратегическая карта',
    description: 'Причинно-следственная логика достижения результата.',
    order: 5,
  },
  {
    id: 'hypotheses',
    title: 'Гипотезы',
    description: 'Ключевые предположения, от которых зависит успех проекта.',
    order: 6,
  },
  {
    id: 'experiments',
    title: 'Проверки',
    description: 'Эксперименты и способы проверки гипотез.',
    order: 7,
  },
  {
    id: 'decisions',
    title: 'Решения',
    description: 'Управленческие решения по результатам проверок и фактов.',
    order: 8,
  },
  {
    id: 'okr-kpi',
    title: 'OKR / KPI',
    description: 'Измеримые цели, ключевые результаты и показатели движения к цели.',
    order: 9,
  },
  {
    id: 'initiatives',
    title: 'Инициативы',
    description: 'Крупные действия и проекты, реализующие стратегический выбор.',
    order: 10,
  },
  {
    id: 'business-processes',
    title: 'Бизнес-процессы',
    description: 'Процессы, которые должны стабильно воспроизводить результат.',
    order: 11,
  },
  {
    id: 'tasks',
    title: 'Задачи',
    description: 'Конкретные действия, исполнители, сроки и статусы.',
    order: 12,
  },
  {
    id: 'facts-learning',
    title: 'Факты и обучение',
    description: 'Фактические данные, обратная связь, выводы и обновление модели проекта.',
    order: 13,
  },
  {
    id: 'whole-project',
    title: 'Весь проект',
    description: 'Финальная проверка связности всего фреймворка проекта.',
    order: 14,
  },
];
