# orchestrator.py
"""Главный координатор ИИ-агентов функций."""

import json
from typing import List, Dict, Optional
from promptra_client import PromtraClient
from prompts import OrchestratorPrompts, ContextBuilder
from deepseek_config import DeepSeekConfig


class Orchestrator:
    """Главный менеджер, координирующий работу функциональных агентов."""

    def __init__(self, function_agents: Dict[str, 'FunctionAgent'], db):
        """
        Args:
            function_agents: Словарь {function_name: FunctionAgent}
            db: SQLAlchemy db instance
        """
        self.agents = function_agents
        self.db = db
        self.client = PromtraClient(model=DeepSeekConfig.ORCHESTRATOR_MODEL)
        self.config = DeepSeekConfig.get_config_dict('orchestrator')
        self.available_functions = list(function_agents.keys())

    def analyze_task(self, task_description: str) -> dict:
        """
        Анализировать задачу и определить необходимые функции.

        Args:
            task_description: Описание задачи/проекта

        Returns:
            dict с анализом и определённостью функций
        """
        prompt = OrchestratorPrompts.analyze_task(
            task_description,
            self.available_functions
        )

        messages = [
            {"role": "user", "content": prompt}
        ]

        result = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('analyze_project'),
            top_p=self.config.get('top_p')
        )

        if result['error']:
            return {
                'status': 'failed',
                'error': result['error'],
                'functions_needed': []
            }

        try:
            content = result['content'].strip()

            # Try to extract JSON from markdown code blocks
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].split('```')[0].strip()

            analysis = json.loads(content)
            return {
                'status': 'success',
                'analysis': analysis,
                'tokens_used': result['tokens_used'],
                'error': None
            }
        except json.JSONDecodeError as e:
            import sys
            print(f"JSON Parse Error: {str(e)}", file=sys.stderr)
            print(f"Response content: {result['content'][:500]}", file=sys.stderr)
            return {
                'status': 'failed',
                'error': f'Could not parse JSON response: {str(e)}',
                'analysis': None
            }

    def orchestrate_project(
        self,
        client_obj,
        project_description: str,
        task_functions: Optional[List[str]] = None
    ) -> dict:
        """
        Координировать работу агентов для проекта.

        Args:
            client_obj: Объект Client
            project_description: Описание проекта
            task_functions: Список функций для привлечения (если None - анализирует автоматически)

        Returns:
            dict с итоговым планом и выводами агентов
        """
        if not task_functions:
            analysis = self.analyze_task(project_description)
            if analysis['status'] == 'failed':
                return analysis

            task_functions = analysis['analysis'].get('functions_needed', [])

        results = {
            'project': client_obj.name,
            'description': project_description,
            'participating_functions': task_functions,
            'agents_analysis': {},
            'consolidated_plan': None
        }

        for function_name in task_functions:
            if function_name not in self.agents:
                continue

            agent = self.agents[function_name]
            agent_result = agent.analyze_project(client_obj, project_description)

            results['agents_analysis'][function_name] = {
                'status': agent_result['status'],
                'analysis': agent_result['analysis'],
                'tokens_used': agent_result['tokens_used']
            }

        consolidated_prompt = self._build_consolidated_prompt(
            project_description,
            results['agents_analysis'],
            task_functions
        )

        messages = [
            {"role": "user", "content": consolidated_prompt}
        ]

        consolidated = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('consolidate'),
            top_p=self.config.get('top_p')
        )

        results['consolidated_plan'] = {
            'status': 'success' if not consolidated['error'] else 'failed',
            'plan': consolidated['content'],
            'error': consolidated['error']
        }

        return results

    def _build_consolidated_prompt(
        self,
        project_description: str,
        agents_analyses: Dict[str, dict],
        functions_list: List[str]
    ) -> str:
        """Построить промпт для консолидации результатов всех агентов."""
        analyses_text = ""
        for func_name, analysis in agents_analyses.items():
            if analysis['status'] == 'success':
                analyses_text += f"\n### Мнение от {func_name}:\n{analysis['analysis']}\n"

        return f"""Ты главный координатор консалтингового проекта.

Проект: {project_description}

Функции, привлечённые к выполнению: {', '.join(functions_list)}

Анализы от специалистов:
{analyses_text}

На основе мнений всех функциональных советников составь консолидированный план действий:
1. Синтез ключевых точек из всех анализов
2. Единый план действий с учётом всех функций
3. Критические зависимости между функциями
4. Риски и вероятные вызовы
5. Предлагаемый порядок работы функций

Будь конкретным и практичным."""

    def get_agent(self, function_name: str) -> Optional['FunctionAgent']:
        """Получить агента по названию функции."""
        return self.agents.get(function_name)

    def list_agents(self) -> List[str]:
        """Список всех доступных агентов."""
        return list(self.agents.keys())
