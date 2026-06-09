from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Integer, String, Boolean, Text, DateTime, Float, JSON,
    ForeignKey, UniqueConstraint, CheckConstraint, Index, text
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from werkzeug.security import generate_password_hash, check_password_hash
from .core.database import Base


class Role(Base):
    """Роль сотрудника (Менеджер проектов, Аналитик и т.д.)."""
    __tablename__ = 'roles'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users: Mapped[List['User']] = relationship('User', back_populates='role')


class User(Base):
    """Сотрудник/пользователь приложения."""
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_founder: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('roles.id'), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    yandex_calendar_token: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    yandex_calendar_refresh_token: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    yandex_calendar_token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    yandex_login: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    role: Mapped[Optional['Role']] = relationship('Role', back_populates='users')
    clients: Mapped[List['Client']] = relationship('Client', back_populates='assigned_employee')
    tasks: Mapped[List['UserTask']] = relationship(
        'UserTask',
        back_populates='created_by_user',
        foreign_keys='UserTask.created_by_id'
    )
    chat_session: Mapped[Optional['UserChatSession']] = relationship(
        'UserChatSession',
        back_populates='user',
        cascade='all, delete-orphan',
        uselist=False
    )

    __table_args__ = (
        Index('uq_users_single_founder', 'is_founder', unique=True,
              postgresql_where=text('is_founder = true'),
              sqlite_where=text('is_founder = 1')),
    )

    def set_password(self, raw: str):
        """Хешировать и сохранить пароль."""
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        """Проверить пароль."""
        return check_password_hash(self.password_hash, raw)


class Function(Base):
    """Функциональный элемент компании (Техническая, Коммерческая и т.д.)."""
    __tablename__ = 'functions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon_key: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    links: Mapped[List['FunctionDepartmentLink']] = relationship(
        'FunctionDepartmentLink',
        back_populates='function',
        cascade='all, delete-orphan'
    )

    @property
    def executor_link(self) -> Optional['FunctionDepartmentLink']:
        """Отдел-исполнитель этой функции (ровно один или None)."""
        return next((l for l in self.links if l.relation_type == 'executor'), None)

    @property
    def consumer_links(self) -> list['FunctionDepartmentLink']:
        """Отделы-потребители этой функции."""
        return [l for l in self.links if l.relation_type == 'consumer']

    @property
    def supplier_links(self) -> list['FunctionDepartmentLink']:
        """Отделы-поставщики для этой функции."""
        return [l for l in self.links if l.relation_type == 'supplier']


class Department(Base):
    """Отдел компании (многофункциональная единица)."""
    __tablename__ = 'departments'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by: Mapped[Optional['User']] = relationship('User', lazy='joined')
    links: Mapped[List['FunctionDepartmentLink']] = relationship(
        'FunctionDepartmentLink',
        back_populates='department',
        cascade='all, delete-orphan'
    )

    @property
    def executor_links(self) -> list['FunctionDepartmentLink']:
        """Функции, которые исполняет этот отдел."""
        return [l for l in self.links if l.relation_type == 'executor']

    @property
    def consumer_links(self) -> list['FunctionDepartmentLink']:
        """Функции, которые потребляет этот отдел."""
        return [l for l in self.links if l.relation_type == 'consumer']

    @property
    def supplier_links(self) -> list['FunctionDepartmentLink']:
        """Функции, в которые поставляет этот отдел."""
        return [l for l in self.links if l.relation_type == 'supplier']


class FunctionDepartmentLink(Base):
    """Связь между функцией и отделом: исполнитель / потребитель / поставщик."""
    __tablename__ = 'function_department_links'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    function_id: Mapped[int] = mapped_column(Integer, ForeignKey('functions.id', ondelete='CASCADE'), nullable=False)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey('departments.id', ondelete='CASCADE'), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    function: Mapped['Function'] = relationship('Function', back_populates='links')
    department: Mapped['Department'] = relationship('Department', back_populates='links')
    created_by: Mapped[Optional['User']] = relationship('User', lazy='joined')

    __table_args__ = (
        UniqueConstraint('function_id', 'department_id', 'relation_type',
                        name='uq_function_department_relation'),
        CheckConstraint("relation_type in ('executor','consumer','supplier')",
                       name='ck_function_department_relation_type'),
    )


class Client(Base):
    """Компания/клиент."""
    __tablename__ = 'clients'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    assigned_employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_employee: Mapped[Optional['User']] = relationship('User', back_populates='clients')
    briefs: Mapped[List['Brief']] = relationship('Brief', back_populates='client', cascade='all, delete-orphan')
    profile: Mapped[Optional['CompanyProfile']] = relationship('CompanyProfile', back_populates='client', cascade='all, delete-orphan', uselist=False)
    chat_sessions: Mapped[List['ChatSession']] = relationship('ChatSession', back_populates='client', cascade='all, delete-orphan')
    tasks: Mapped[List['UserTask']] = relationship('UserTask', back_populates='client', cascade='all, delete-orphan')


class Brief(Base):
    """Брифинг (документ с анкетой)."""
    __tablename__ = 'briefs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brief_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='Не заполнено')
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey('clients.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='briefs')
    sections: Mapped[List['BriefSection']] = relationship('BriefSection', back_populates='brief', cascade='all, delete-orphan')


class BriefSection(Base):
    """Раздел брифа (структурированные данные вместо плоского JSON)."""
    __tablename__ = 'brief_sections'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brief_id: Mapped[int] = mapped_column(Integer, ForeignKey('briefs.id'), nullable=False)
    section_name: Mapped[str] = mapped_column(String(100), nullable=False)
    section_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_flags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    brief: Mapped['Brief'] = relationship('Brief', back_populates='sections')


class CompanyProfile(Base):
    """Быстрый снимок компании для ИИ анализа."""
    __tablename__ = 'company_profiles'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey('clients.id'), nullable=False)
    executive_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    last_analyzed: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='profile')


class AIAnalysisCache(Base):
    """Кеширование ответов ИИ для избежания повторных запросов."""
    __tablename__ = 'ai_analysis_cache'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('clients.id'), nullable=True)
    prompt_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    response: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    """Сессия чата с ИИ."""
    __tablename__ = 'chat_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey('clients.id'), nullable=False)
    session_token: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='chat_sessions')
    messages: Mapped[List['ChatMessage']] = relationship('ChatMessage', back_populates='session', cascade='all, delete-orphan')


class ChatMessage(Base):
    """Сообщение в чате."""
    __tablename__ = 'chat_messages'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey('chat_sessions.id'), nullable=False)
    role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped['ChatSession'] = relationship('ChatSession', back_populates='messages')


class AIAgent(Base):
    """ИИ-советник для функции."""
    __tablename__ = 'ai_agents'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    function_id: Mapped[int] = mapped_column(Integer, ForeignKey('functions.id', ondelete='CASCADE'), nullable=False, unique=True)
    model: Mapped[str] = mapped_column(String(50), default='claude-3.5-sonnet')
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks: Mapped[List['AITask']] = relationship('AITask', back_populates='agent', cascade='all, delete-orphan')


class AITask(Base):
    """Задача для ИИ-агента."""
    __tablename__ = 'ai_tasks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey('ai_agents.id', ondelete='CASCADE'), nullable=False)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('clients.id', ondelete='CASCADE'), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    agent: Mapped['AIAgent'] = relationship('AIAgent', back_populates='tasks')
    client: Mapped[Optional['Client']] = relationship('Client', lazy='joined')
    runs: Mapped[List['AIAgentRun']] = relationship('AIAgentRun', back_populates='task', cascade='all, delete-orphan')


class AIAgentRun(Base):
    """Выполнение задачи агентом."""
    __tablename__ = 'ai_agent_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey('ai_tasks.id', ondelete='CASCADE'), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    input_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    execution_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    task: Mapped['AITask'] = relationship('AITask', back_populates='runs')


class UserTask(Base):
    """Пользовательская задача с интеграцией в Яндекс.Календарь."""
    __tablename__ = 'user_tasks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey('clients.id'), nullable=False)
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey('users.id'), nullable=False)
    input_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    calendar_event_uid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='tasks')
    assigned_to: Mapped[Optional['User']] = relationship('User', foreign_keys=[assigned_to_id], lazy='joined')
    created_by_user: Mapped['User'] = relationship('User', foreign_keys=[created_by_id], back_populates='tasks')
    completion: Mapped[Optional['TaskCompletion']] = relationship('TaskCompletion', back_populates='task', foreign_keys='TaskCompletion.task_id', uselist=False, cascade='all, delete-orphan')


class TaskCompletion(Base):
    """Результаты выполнения задачи."""
    __tablename__ = 'task_completions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey('user_tasks.id'), unique=True, nullable=False)
    actual_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_failure: Mapped[bool] = mapped_column(Boolean, default=False)
    difficulties: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    how_overcome: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_step: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('user_tasks.id'), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped['UserTask'] = relationship('UserTask', back_populates='completion', foreign_keys=[task_id])
    next_task: Mapped[Optional['UserTask']] = relationship('UserTask', foreign_keys=[next_task_id], lazy='joined')


class UserChatSession(Base):
    """Основная сессия чата пользователя с ИИ-ассистентом (одна на пользователя)."""
    __tablename__ = 'user_chat_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey('users.id'), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped['User'] = relationship('User', back_populates='chat_session')
    subchats: Mapped[List['UserSubChat']] = relationship('UserSubChat', back_populates='session', cascade='all, delete-orphan')


class UserSubChat(Base):
    """Подчат для конкретной задачи (может быть несколько версий)."""
    __tablename__ = 'user_subchats'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey('user_chat_sessions.id'), nullable=False)
    task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('user_tasks.id'), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session: Mapped['UserChatSession'] = relationship('UserChatSession', back_populates='subchats')
    messages: Mapped[List['UserChatMessage']] = relationship('UserChatMessage', back_populates='subchat', cascade='all, delete-orphan')
    task: Mapped[Optional['UserTask']] = relationship('UserTask', foreign_keys=[task_id], lazy='joined')


class UserChatMessage(Base):
    """Сообщение в подчате."""
    __tablename__ = 'user_chat_messages'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subchat_id: Mapped[int] = mapped_column(Integer, ForeignKey('user_subchats.id'), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subchat: Mapped['UserSubChat'] = relationship('UserSubChat', back_populates='messages')


class OrchestrationRun(Base):
    """Запуск оркестрации проекта через LangChain + Celery."""
    __tablename__ = 'orchestration_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey('clients.id'), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    client: Mapped['Client'] = relationship('Client', lazy='joined')
    analyses: Mapped[List['FunctionAnalysis']] = relationship(
        'FunctionAnalysis', back_populates='run', cascade='all, delete-orphan'
    )


class FunctionAnalysis(Base):
    """Результат анализа конкретной функции в рамках оркестрации."""
    __tablename__ = 'function_analyses'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    orchestration_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('orchestration_runs.id', ondelete='CASCADE'), nullable=False
    )
    function_name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    run: Mapped['OrchestrationRun'] = relationship('OrchestrationRun', back_populates='analyses')
