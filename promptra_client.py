# promptra_client.py
import os
import time
from typing import Optional
from openai import OpenAI

class PromtraClient:
    """Обёртка для работы с Promptra API (OpenAI-совместимый интерфейс)."""

    def __init__(self, api_key: Optional[str] = None, model: str = 'claude-3.5-sonnet'):
        self.api_key = api_key or os.getenv('PROMPTRA_API_KEY')
        self.model = model
        self.base_url = 'https://api.promptra.ru/v1'

        print(f"[PROMPTRA] Initializing with model: {model}")
        print(f"[PROMPTRA] API key present: {bool(self.api_key)}")
        print(f"[PROMPTRA] Base URL: {self.base_url}")

        if not self.api_key:
            raise ValueError('PROMPTRA_API_KEY environment variable not set')

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=300.0  # 5 минут timeout на запрос (Promptra может быть медленный, особенно для больших моделей)
        )

        print(f"[PROMPTRA] OpenAI client initialized successfully")

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

            print(f"\n[PROMPTRA] Sending request...")
            print(f"[PROMPTRA] Messages: {len(params['messages'])} message(s)")
            for i, msg in enumerate(params['messages']):
                print(f"[PROMPTRA]   Message {i}: role={msg['role']}, content_length={len(msg['content'])}")
                if len(msg['content']) < 200:
                    print(f"[PROMPTRA]     Content: {msg['content']}")

            start_time = time.time()
            print(f"[PROMPTRA] Starting API call at {start_time}")

            response = self.client.chat.completions.create(**params)

            elapsed_time = time.time() - start_time
            print(f"[PROMPTRA] API call completed in {elapsed_time:.2f} seconds")

            content = response.choices[0].message.content

            # Логирование для отладки
            print(f"[PROMPTRA] Response received")
            print(f"[PROMPTRA] Model: {response.model}")
            print(f"[PROMPTRA] Stop reason: {response.choices[0].finish_reason}")
            print(f"[PROMPTRA] Content length: {len(content) if content else 0}")
            print(f"[PROMPTRA] Content preview: {content[:500] if content else 'None'}")
            if response.usage:
                print(f"[PROMPTRA] Tokens - input: {response.usage.prompt_tokens}, output: {response.usage.completion_tokens}")

            return {
                'content': content,
                'tokens_used': response.usage.total_tokens if response.usage else 0,
                'model': response.model,
                'stop_reason': response.choices[0].finish_reason,
                'error': None
            }
        except Exception as e:
            error_msg = str(e)
            print(f"\n[PROMPTRA] Error: {error_msg}")
            if 'timeout' in error_msg.lower() or 'timed out' in error_msg.lower():
                print("[PROMPTRA] ⚠️ REQUEST TIMEOUT - Promptra API took too long to respond")
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
