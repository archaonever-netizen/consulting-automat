# function_agent.py
"""Базовый класс для ИИ-советников функций."""

import time
from datetime import datetime
from promptra_client import PromtraClient
from prompts import FunctionAgentPrompts, ContextBuilder
from deepseek_config import DeepSeekConfig


class FunctionAgent:
    """ИИ-советник для отдельной функции компании."""

    def __init__(self, function_obj, db):
        """
        Args:
            function_obj: Объект Function из БД
            db: SQLAlchemy db instance
        """
        self.function = function_obj
        self.db = db
        self.name = function_obj.name
        self.description = function_obj.description or ""
        self.client = PromtraClient(model=DeepSeekConfig.FUNCTION_AGENT_MODEL)
        self.config = DeepSeekConfig.get_config_dict('function')

        base_prompt = FunctionAgentPrompts.system_prompt(
            self.name,
            self.description
        )
        self.system_prompt = base_prompt + DeepSeekConfig.DEEPSEEK_SYSTEM_SUFFIX

    def analyze_project(self, client_obj, project_description: str) -> dict:
        """
        Анализировать проект с точки зрения этой функции.

        Args:
            client_obj: Объект Client
            project_description: Описание проекта

        Returns:
            dict с анализом и рекомендациями
        """
        context = f"{ContextBuilder.format_function_context(self.function)}\n\n"
        context += ContextBuilder.format_client_context(client_obj)

        analysis_prompt = FunctionAgentPrompts.analyze_project(
            client_obj.name,
            project_description
        )

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"{context}\n\n{analysis_prompt}"}
        ]

        result = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('analyze_project'),
            top_p=self.config.get('top_p')
        )

        return {
            'status': 'success' if not result['error'] else 'failed',
            'analysis': result['content'],
            'error': result['error'],
            'tokens_used': result['tokens_used']
        }

    def create_action_plan(self, client_obj, project_context: str) -> dict:
        """
        Создать конкретный план действий для проекта.

        Args:
            client_obj: Объект Client
            project_context: Контекст проекта

        Returns:
            dict с планом действий
        """
        plan_prompt = FunctionAgentPrompts.create_actionable_plan(
            project_context,
            f"Советник по {self.name}"
        )

        context = f"{ContextBuilder.format_function_context(self.function)}\n\n"
        context += ContextBuilder.format_client_context(client_obj)

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"{context}\n\n{plan_prompt}"}
        ]

        result = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('create_plan'),
            top_p=self.config.get('top_p')
        )

        return {
            'status': 'success' if not result['error'] else 'failed',
            'plan': result['content'],
            'error': result['error'],
            'tokens_used': result['tokens_used']
        }

    def generate_checklist(self, topic: str) -> dict:
        """
        Сгенерировать чек-лист по теме.

        Args:
            topic: Тема для чек-листа

        Returns:
            dict с чек-листом
        """
        checklist_prompt = FunctionAgentPrompts.generate_checklist(topic)

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": checklist_prompt}
        ]

        result = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('generate_checklist'),
            top_p=self.config.get('top_p')
        )

        return {
            'status': 'success' if not result['error'] else 'failed',
            'checklist': result['content'],
            'error': result['error'],
            'tokens_used': result['tokens_used']
        }

    def process_task(self, task_obj) -> dict:
        """
        Обработать задачу агентом.

        Args:
            task_obj: Объект AITask из БД

        Returns:
            dict с результатом выполнения
        """
        from models import AIAgentRun

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task_obj.description}
        ]

        start_time = time.time()

        result = self.client.chat_completion(
            messages,
            temperature=self.config['temperature'],
            max_tokens=DeepSeekConfig.get_tokens_for_task('create_plan'),
            top_p=self.config.get('top_p')
        )

        execution_time = time.time() - start_time

        run = AIAgentRun(
            task_id=task_obj.id,
            status='completed' if not result['error'] else 'failed',
            input_prompt=task_obj.description,
            output_response=result['content'],
            error_message=result['error'],
            tokens_used=result['tokens_used'],
            execution_time=execution_time,
            completed_at=datetime.utcnow() if not result['error'] else None
        )

        self.db.session.add(run)
        self.db.session.commit()

        task_obj.status = 'completed' if not result['error'] else 'failed'
        self.db.session.commit()

        return {
            'run_id': run.id,
            'status': run.status,
            'result': result['content'],
            'error': result['error'],
            'tokens_used': result['tokens_used'],
            'execution_time': execution_time
        }
