# promptra_client.py
import os
from typing import Optional
from openai import OpenAI

class PromtraClient:
    """Обёртка для работы с Promptra API (OpenAI-совместимый интерфейс)."""

    def __init__(self, api_key: Optional[str] = None, model: str = 'claude-3.5-sonnet'):
        self.api_key = api_key or os.getenv('PROMPTRA_API_KEY')
        self.model = model
        self.base_url = 'https://api.promptra.ru/v1'

        if not self.api_key:
            raise ValueError('PROMPTRA_API_KEY environment variable not set')

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )

    def chat_completion(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None
    ) -> dict:
        """
        Отправить запрос к Promptra и получить ответ.

        Args:
            messages: Список сообщений формата [{'role': '...', 'content': '...'}]
            temperature: Температура для творческости ответа (0-1)
            max_tokens: Максимальное количество токенов в ответе
            model: Модель (если не указана, используется default)
            top_p: Nucleus sampling parameter (0-1)
            top_k: Top-k sampling parameter

        Returns:
            dict с полями: content, tokens_used, model, stop_reason
        """
        try:
            params = {
                'model': model or self.model,
                'messages': messages,
                'temperature': temperature,
                'max_tokens': max_tokens or 2000
            }

            # Добавляем параметры семплирования если указаны
            if top_p is not None:
                params['top_p'] = top_p
            if top_k is not None:
                params['top_k'] = top_k

            response = self.client.chat.completions.create(**params)

            return {
                'content': response.choices[0].message.content,
                'tokens_used': response.usage.total_tokens if response.usage else 0,
                'model': response.model,
                'stop_reason': response.choices[0].finish_reason,
                'error': None
            }
        except Exception as e:
            return {
                'content': None,
                'tokens_used': 0,
                'model': model or self.model,
                'stop_reason': None,
                'error': str(e)
            }

    def count_tokens(self, text: str) -> int:
        """Приблизительно подсчитать токены в тексте (1 слово ≈ 1.3 токена)."""
        return int(len(text.split()) * 1.3)
