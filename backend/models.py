from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Integer, String, Boolean, Text, DateTime, Date, Float, JSON,
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
    yandex_tracker_connection: Mapped[Optional['YandexTrackerConnection']] = relationship(
        'YandexTrackerConnection',
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
    # Содержимое функции (списки объектов {title, note}); product — текст.
    frameworks: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    skills: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    features: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    databases: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    product: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    # Содержимое отдела (списки объектов {title, note}).
    ai_employees: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    employees: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    regulations: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    instructions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    frameworks: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
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
    # Профиль размера бизнеса: startup|micro|small|small_medium|medium.
    # medium = эталон (текущие 8 брифов), дефолт для существующих клиентов.
    business_size: Mapped[str] = mapped_column(String(20), default='medium', server_default='medium', nullable=False)
    assigned_employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_employee: Mapped[Optional['User']] = relationship('User', back_populates='clients')
    briefs: Mapped[List['Brief']] = relationship('Brief', back_populates='client', cascade='all, delete-orphan')
    profile: Mapped[Optional['CompanyProfile']] = relationship('CompanyProfile', back_populates='client', cascade='all, delete-orphan', uselist=False)
    chat_sessions: Mapped[List['ChatSession']] = relationship('ChatSession', back_populates='client', cascade='all, delete-orphan')
    tasks: Mapped[List['UserTask']] = relationship('UserTask', back_populates='client', cascade='all, delete-orphan')
    projects: Mapped[List['Project']] = relationship(
        'Project', back_populates='client', cascade='all, delete-orphan'
    )
    portal_users: Mapped[List['ClientUser']] = relationship(
        'ClientUser', back_populates='client', cascade='all, delete-orphan'
    )
    documents: Mapped[List['ClientDocument']] = relationship(
        'ClientDocument', back_populates='client', cascade='all, delete-orphan'
    )
    portal_requests: Mapped[List['PortalRequest']] = relationship(
        'PortalRequest', back_populates='client', cascade='all, delete-orphan'
    )


class ClientUser(Base):
    """Сотрудник компании-клиента — пользователь клиентского портала.

    Отдельный кластер пользователей (не путать с `users` — сотрудниками нашей
    компании). Создаётся и управляется ТОЛЬКО нашим сотрудником из карточки
    клиента (вкладка «Организационная структура»). Пароль на Этапе 1 задаётся
    вручную нашим сотрудником и хранится только как хэш (как у `User`).

    Права «попроще»: `role` — текстовая метка роли, `sections` — список ключей
    разрешённых разделов портала (скелет: project|stages|status|documents|
    events|info). Сам портал и вход клиента появятся на Этапе 2; здесь — только
    учётка и доступы.
    """
    __tablename__ = 'client_users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('clients.id', ondelete='CASCADE'), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(100), default='', server_default='', nullable=False)
    # Ключи разрешённых разделов портала (JSON-массив строк).
    sections: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='portal_users')

    def set_password(self, raw: str):
        """Хешировать и сохранить пароль (open-text в БД не хранится)."""
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        """Проверить пароль клиента портала."""
        return check_password_hash(self.password_hash, raw)


class ClientDocument(Base):
    """Документ/файл, опубликованный для клиента (раздел «Документы и файлы»).

    Файл хранится на сервере (Этап 2 — локальная ФС, см. services/client_documents);
    в БД лежит относительный путь `stored_path`. Загружает наш сотрудник из
    карточки клиента; клиент в портале видит и скачивает. Принадлежит клиенту
    (а не конкретному проекту) — портал на Этапе 2 работает на уровне клиента.
    """
    __tablename__ = 'client_documents'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('clients.id', ondelete='CASCADE'), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default='application/octet-stream', nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='documents')


class PortalRequest(Base):
    """Заявка, оставленная клиентом из портала (экран «Оставить заявку»).

    Клиент описывает вопрос/задачу — наша команда получает её на стороне
    приложения. Принадлежит клиенту (как и документы); `client_user_id` —
    автор-сотрудник клиента (None для исторических/системных). Превью «Вид для
    клиента» заявку не создаёт (read-only контур).
    """
    __tablename__ = 'portal_requests'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('clients.id', ondelete='CASCADE'), nullable=False, index=True
    )
    client_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('client_users.id', ondelete='SET NULL'), nullable=True
    )
    author_name: Mapped[str] = mapped_column(String(200), default='', server_default='', nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # new | in_progress | done — обрабатывается нашей командой.
    status: Mapped[str] = mapped_column(String(20), default='new', server_default='new', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped['Client'] = relationship('Client', back_populates='portal_requests')


class Project(Base):
    """Consulting project bound to exactly one client."""
    __tablename__ = 'projects'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('clients.id', ondelete='CASCADE'), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    client: Mapped['Client'] = relationship('Client', back_populates='projects')
    card_states: Mapped[List['ProjectCardState']] = relationship(
        'ProjectCardState', back_populates='project', cascade='all, delete-orphan'
    )


class ProjectCardState(Base):
    """Состояние одной карточки фреймворка проекта.

    Хранит и введённые пользователем данные карточки (content_json — тот же
    lossless-снапшот, что раньше жил только в localStorage), и последний
    результат ИИ-валидатора (validation_json). Одна строка на (project, card).
    """
    __tablename__ = 'project_card_states'
    __table_args__ = (
        UniqueConstraint('project_id', 'card_id', name='uq_project_card'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True
    )
    card_id: Mapped[str] = mapped_column(String(60), nullable=False)
    # Введённое содержимое карточки (произвольная JSON-структура снапшота).
    content_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Последний результат валидатора: {answer, verdict, evidence, contentHash, checkedAt}.
    validation_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped['Project'] = relationship('Project', back_populates='card_states')


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
    preparation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(40), default='app', server_default='app', nullable=False)
    telegram_chat_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    telegram_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    telegram_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telegram_full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
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


class KnowledgeCategory(Base):
    """Раздел Базы знаний (Разделы интерфейса, Сеть агентов, Сценарии, Глоссарий…).

    Двухуровневая структура: категория → статьи. Контент предназначен и для
    людей (рендер в UI), и для ИИ-помощников (дайджест в системный промпт).
    """
    __tablename__ = 'knowledge_categories'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon_key: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Как раздел отображается на фронте: 'cards' | 'list' | 'glossary'
    layout: Mapped[str] = mapped_column(String(20), default='cards', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    articles: Mapped[List['KnowledgeArticle']] = relationship(
        'KnowledgeArticle',
        back_populates='category',
        cascade='all, delete-orphan',
        order_by='KnowledgeArticle.sort_order',
    )


class KnowledgeArticle(Base):
    """Элемент Базы знаний внутри раздела.

    body хранится как Markdown — единый формат: человек читает рендер,
    ИИ-помощник читает сырой текст. Флаги управляют видимостью:
    is_published (показывать в UI) и ai_visible (включать в дайджест для ИИ).
    """
    __tablename__ = 'knowledge_articles'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_categories.id', ondelete='CASCADE'), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon_key: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    route: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped['KnowledgeCategory'] = relationship('KnowledgeCategory', back_populates='articles')
    created_by: Mapped[Optional['User']] = relationship('User', lazy='joined')


class KnowledgeSection(Base):
    """Hierarchical navigation/taxonomy node for source-based knowledge."""
    __tablename__ = 'knowledge_sections'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('knowledge_sections.id', ondelete='CASCADE'), nullable=True
    )
    section_type: Mapped[str] = mapped_column(String(40), default='category', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped[Optional['KnowledgeSection']] = relationship(
        'KnowledgeSection', remote_side='KnowledgeSection.id', back_populates='children'
    )
    children: Mapped[List['KnowledgeSection']] = relationship(
        'KnowledgeSection',
        back_populates='parent',
        cascade='all, delete-orphan',
        order_by='KnowledgeSection.sort_order',
    )
    source_links: Mapped[List['KnowledgeSourceSectionLink']] = relationship(
        'KnowledgeSourceSectionLink', back_populates='section', cascade='all, delete-orphan'
    )


class KnowledgeSource(Base):
    """Ingested primary source for future RAG/indexing."""
    __tablename__ = 'knowledge_sources'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    language: Mapped[str] = mapped_column(String(20), default='en', nullable=False)
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    processing_status: Mapped[str] = mapped_column(String(40), default='pending', nullable=False)
    checksum: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # RAG: confidentiality + methodology tag (added in RAG phase 1).
    confidential: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    methodology: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    texts: Mapped[List['KnowledgeSourceText']] = relationship(
        'KnowledgeSourceText', back_populates='source', cascade='all, delete-orphan'
    )
    fragments: Mapped[List['KnowledgeSourceFragment']] = relationship(
        'KnowledgeSourceFragment',
        back_populates='source',
        cascade='all, delete-orphan',
        order_by='KnowledgeSourceFragment.sort_order',
    )
    layers: Mapped[List['KnowledgeSourceLayer']] = relationship(
        'KnowledgeSourceLayer', back_populates='source', cascade='all, delete-orphan'
    )
    section_links: Mapped[List['KnowledgeSourceSectionLink']] = relationship(
        'KnowledgeSourceSectionLink', back_populates='source', cascade='all, delete-orphan'
    )


class KnowledgeSourceText(Base):
    """Verbatim extracted source text, separated from generated layers."""
    __tablename__ = 'knowledge_source_texts'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    text_origin: Mapped[str] = mapped_column(String(40), default='source_original', nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource', back_populates='texts')


class KnowledgeSourceFragment(Base):
    """Source-backed chunk for later embeddings/RAG."""
    __tablename__ = 'knowledge_source_fragments'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    full_text: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_origin: Mapped[str] = mapped_column(String(40), default='ai_generated', nullable=False)
    text_origin: Mapped[str] = mapped_column(String(40), default='source_original', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    outline_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    page_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # RAG metadata for filtered hybrid search (added in RAG phase 1).
    methodology: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    maturity_level: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    lang: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    source_version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    confidential: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # NOTE: the Postgres-only `search_tsv` (tsvector) column and the pgvector
    # embeddings live in the DB / `knowledge_embeddings` and are intentionally
    # not mapped here so the ORM stays SQLite-compatible.

    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource', back_populates='fragments')

    __table_args__ = (
        Index('ix_knowledge_fragments_source_order', 'source_id', 'sort_order'),
    )


class KnowledgeSourceLayer(Base):
    """Generated description/context layers for a source."""
    __tablename__ = 'knowledge_source_layers'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    layer_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_origin: Mapped[str] = mapped_column(String(40), default='ai_generated', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource', back_populates='layers')


class KnowledgeSourceSectionLink(Base):
    """Many-to-many link between sources and taxonomy sections."""
    __tablename__ = 'knowledge_source_section_links'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sections.id', ondelete='CASCADE'), nullable=False
    )
    relation_type: Mapped[str] = mapped_column(String(40), default='listed_under', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource', back_populates='section_links')
    section: Mapped['KnowledgeSection'] = relationship('KnowledgeSection', back_populates='source_links')

    __table_args__ = (
        UniqueConstraint('source_id', 'section_id', 'relation_type', name='uq_knowledge_source_section'),
        Index('ix_knowledge_source_section_section', 'section_id'),
    )


class KnowledgeCard(Base):
    """Generated retrievable cards: method cards, typical errors, diagnostic questions.

    These are the core derived layer the Methodolog searches by `card_type`.
    A card may only cite real source pages: `supporting_fragment_id` /
    `page_start` / `page_end` point at the actual source fragment that backs it.
    The Postgres-only generated `search_tsv` column is not mapped here so the
    ORM stays SQLite-compatible.
    """
    __tablename__ = 'knowledge_cards'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    # 'method_card' | 'typical_error' | 'diagnostic_question'
    card_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # Stable key for idempotent re-generation (no duplicates on re-run).
    card_key: Mapped[str] = mapped_column(String(160), nullable=False)
    methodology: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    maturity_level: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    content_origin: Mapped[str] = mapped_column(String(40), default='ai_generated', nullable=False)
    lang: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidential: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supporting_fragment_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey('knowledge_source_fragments.id', ondelete='SET NULL'), nullable=True
    )
    page_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    page_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_ref: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource')

    __table_args__ = (
        UniqueConstraint('source_id', 'card_key', name='uq_knowledge_cards_key'),
        Index('ix_cards_type', 'card_type'),
        Index('ix_cards_methodology', 'methodology'),
        Index('ix_cards_source', 'source_id'),
    )


class IngestJob(Base):
    """Background import job for the «Add methodology» screen.

    Tracks one source-ingest run: status/stage/progress, token spend and the
    stored PDF path. The PDF in Supabase Storage and this row are kept even on
    failure (so the founder can retry); only half-written DB data is cleaned.
    """
    __tablename__ = 'ingest_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_key: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # draft | queued | running | done | failed
    status: Mapped[str] = mapped_column(String(20), default='draft', nullable=False)
    # extract | ingest | embed_fragments | layers | embed_cards | attach | finished
    stage: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    progress: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    framework_key: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    framework_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    methodology: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidential: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    est_pages: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    est_cost_rub: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tokens_embeddings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_generation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class YandexTrackerConnection(Base):
    """Per-user connection settings for Yandex Tracker.

    The access token is stored encrypted with Fernet; issue data remains in
    Yandex Tracker and is not duplicated locally.
    """
    __tablename__ = 'yandex_tracker_connections'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('users.id'), nullable=False, unique=True
    )
    org_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cloud_org_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    token_type: Mapped[str] = mapped_column(String(20), default='oauth', nullable=False)
    token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tracker_user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tracker_user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tracker_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_queue: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped['User'] = relationship('User', back_populates='yandex_tracker_connection')


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


class GoalDocument(Base):
    """Документ декомпозиции цели целиком (JSON) + поля для выборки/доступа.

    Дерево (цель → периоды → метрики → допущения → changeLog) хранится единым
    JSON в `document` по схеме GoalDecompositionDocument (schemaVersion 1.0.0).
    Типизация/валидация — в services/goal_decomposition (Pydantic). `dataset` —
    известные факты (единственный источник user_input для движка).
    """
    __tablename__ = 'goal_documents'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('users.id'), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='draft', nullable=False)
    schema_version: Mapped[str] = mapped_column(String(20), default='1.0.0', nullable=False)
    document: Mapped[dict] = mapped_column(JSON, nullable=False)
    dataset: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped[Optional['User']] = relationship('User', lazy='joined')


# ─────────────────────────── ИИ-Сотрудники (боты) ───────────────────────────
# Раздел «ИИ-Сотрудники»: карточки ботов поверх готовых бэкенд-агентов.
# Промпты, модель и привязки бота хранятся в БД (а не в хардкоде), чтобы разные
# боты вели себя по-разному на одном движке. Все модели — SQLite-совместимы.

class Bot(Base):
    """ИИ-Сотрудник: карточка бота со своим конфигом (промпты, модель, привязки).

    Агент-движок (`agent_impl`, напр. 'methodolog') читает промпты и модель
    отсюда. Два промпта работают по-разному:
      • system_prompt    — основная роль/поведение, идёт как system-роль;
      • persistent_prompt — короткая стоячая инструкция, автоматически
        добавляется к КАЖДОМУ запросу бота (не теряется в длинных диалогах).
    """
    __tablename__ = 'bots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    persistent_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # Какой бэкенд-агент обслуживает бота (привязка к готовому движку).
    agent_impl: Mapped[str] = mapped_column(String(40), default='methodolog', nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    framework_links: Mapped[List['BotFramework']] = relationship(
        'BotFramework', back_populates='bot', cascade='all, delete-orphan'
    )
    department_links: Mapped[List['BotDepartment']] = relationship(
        'BotDepartment', back_populates='bot', cascade='all, delete-orphan'
    )
    token_usage: Mapped[List['BotTokenUsage']] = relationship(
        'BotTokenUsage', back_populates='bot', cascade='all, delete-orphan'
    )


class Framework(Base):
    """Фреймворк = именованная группа источников знаний (BPMM, CMMI…).

    Терминология: в UI это «Фреймворк», технически он опирается на существующее
    поле `methodology`/источники RAG (см. KnowledgeSource) — параллельной системы
    знаний не строим, переиспользуем фильтры гибридного поиска. Переиспользуем
    между ботами (many-to-many через BotFramework).
    """
    __tablename__ = 'frameworks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_links: Mapped[List['FrameworkSource']] = relationship(
        'FrameworkSource', back_populates='framework', cascade='all, delete-orphan'
    )
    bot_links: Mapped[List['BotFramework']] = relationship(
        'BotFramework', back_populates='framework', cascade='all, delete-orphan'
    )


class FrameworkSource(Base):
    """Связь фреймворк ↔ источник знаний (knowledge_sources). M2M."""
    __tablename__ = 'framework_sources'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    framework_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('frameworks.id', ondelete='CASCADE'), nullable=False
    )
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('knowledge_sources.id', ondelete='CASCADE'), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    framework: Mapped['Framework'] = relationship('Framework', back_populates='source_links')
    source: Mapped['KnowledgeSource'] = relationship('KnowledgeSource', lazy='joined')

    __table_args__ = (
        UniqueConstraint('framework_id', 'source_id', name='uq_framework_source'),
    )


class BotFramework(Base):
    """Связь бот ↔ фреймворк. M2M (фреймворки переиспользуемы между ботами)."""
    __tablename__ = 'bot_frameworks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('bots.id', ondelete='CASCADE'), nullable=False
    )
    framework_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('frameworks.id', ondelete='CASCADE'), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bot: Mapped['Bot'] = relationship('Bot', back_populates='framework_links')
    framework: Mapped['Framework'] = relationship('Framework', back_populates='bot_links')

    __table_args__ = (
        UniqueConstraint('bot_id', 'framework_id', name='uq_bot_framework'),
    )


class BotDepartment(Base):
    """Связь бот ↔ отдел (departments). Делает бота «Сотрудником» отдела. M2M."""
    __tablename__ = 'bot_departments'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('bots.id', ondelete='CASCADE'), nullable=False
    )
    department_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('departments.id', ondelete='CASCADE'), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bot: Mapped['Bot'] = relationship('Bot', back_populates='department_links')
    department: Mapped['Department'] = relationship('Department', lazy='joined')

    __table_args__ = (
        UniqueConstraint('bot_id', 'department_id', name='uq_bot_department'),
    )


class BotTokenUsage(Base):
    """Лог расхода токенов по боту с датами (счётчик за день/неделю/месяц).

    Каждый вызов бота (в т.ч. проверочный чат) пишет строку под своим bot_id.
    Счётчики за период — агрегация SUM(total_tokens) по usage_date.
    """
    __tablename__ = 'bot_token_usage'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('bots.id', ondelete='CASCADE'), nullable=False, index=True
    )
    usage_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 'test' — проверочный чат в карточке; 'prod' — боевые вызовы.
    source: Mapped[str] = mapped_column(String(20), default='test', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bot: Mapped['Bot'] = relationship('Bot', back_populates='token_usage')


class EditLock(Base):
    """Единый владельческий пароль-замок на редактирование промптов/настроек ботов.

    Одна строка на всё приложение (id=1). Пароль хранится только как bcrypt-хэш
    (через werkzeug), открытым текстом не лежит. Не путать с паролем входа.
    """
    __tablename__ = 'edit_lock'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, raw: str):
        """Хешировать и сохранить пароль-замок."""
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        """Проверить пароль-замок. Если пароль ещё не задан — доступа нет."""
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, raw)
