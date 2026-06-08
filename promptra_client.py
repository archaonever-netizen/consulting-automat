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
        top_p: Optional[float] = None
    ) -> dict:
        """
        Отправить запрос к Promptra и получить ответ.

        Args:
            messages: Список сообщений формата [{'role': '...', 'content': '...'}]
            temperature: Температура для творческости ответа (0-1)
            max_tokens: Максимальное количество токенов в ответе
            model: Модель (если не указана, используется default)
            top_p: Nucleus sampling parameter (0-1)

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

            # Добавляем параметр семплирования если указан
            if top_p is not None:
                params['top_p'] = top_p

            response = self.client.chat.completions.create(**params)

            content = response.choices[0].message.content

            # Логирование для отладки
            print(f"\n[PROMPTRA] Response received")
            print(f"[PROMPTRA] Model: {response.model}")
            print(f"[PROMPTRA] Content length: {len(content) if content else 0}")
            print(f"[PROMPTRA] Content preview: {content[:500] if content else 'None'}")

            return {
                'content': content,
                'tokens_used': response.usage.total_tokens if response.usage else 0,
                'model': response.model,
                'stop_reason': response.choices[0].finish_reason,
                'error': None
            }
        except Exception as e:
            import sys
            print(f"\n[PROMPTRA] Error: {str(e)}", file=sys.stderr)
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
