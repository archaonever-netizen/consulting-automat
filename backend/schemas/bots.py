from pydantic import BaseModel
from typing import Optional, List


class BotUpdate(BaseModel):
    """Частичное обновление бота. Любое поле опционально. Требует unlock-токен."""
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    persistent_prompt: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


class BotFrameworksSet(BaseModel):
    """Полная замена набора фреймворков бота."""
    framework_ids: List[int]


class BotDepartmentsSet(BaseModel):
    """Полная замена набора отделов бота."""
    department_ids: List[int]


class LockSetRequest(BaseModel):
    """Задать/сменить пароль-замок. При смене нужен текущий пароль."""
    new_password: str
    current_password: Optional[str] = None


class LockVerifyRequest(BaseModel):
    password: str


class BotChatRequest(BaseModel):
    """Проверочное сообщение боту. Использует текущий конфиг бота."""
    message: str
