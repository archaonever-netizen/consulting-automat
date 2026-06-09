# models.py
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class Role(db.Model):
    """Роль сотрудника (Менеджер проектов, Аналитик и т.д.)."""
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(db.Model):
    """Сотрудник/пользователь приложения."""
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(200), nullable=False)
    is_founder = db.Column(db.Boolean, default=False, nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    yandex_calendar_token = db.Column(db.String(2048), nullable=True)
    yandex_calendar_refresh_token = db.Column(db.String(2048), nullable=True)
    yandex_calendar_token_expiry = db.Column(db.DateTime, nullable=True)
    yandex_login = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    role = db.relationship('Role', backref='users', lazy=True)
    clients = db.relationship('Client', backref='assigned_employee', lazy=True)
    tasks = db.relationship('UserTask', backref='created_by_user', lazy=True, foreign_keys='UserTask.created_by_id')
    chat_sessions = db.relationship('UserChatSession', backref='user', lazy=True, cascade='all, delete-orphan')

    __table_args__ = (
        db.Index('uq_users_single_founder', 'is_founder', unique=True,
                 postgresql_where=db.text('is_founder = true'),
                 sqlite_where=db.text('is_founder = 1')),
    )

    def set_password(self, raw):
        """Хешировать и сохранить пароль."""
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        """Проверить пароль."""
        return check_password_hash(self.password_hash, raw)


class FunctionDepartmentLink(db.Model):
    """Связь между функцией и отделом: исполнитель / потребитель / поставщик."""
    __tablename__ = 'function_department_links'
    id = db.Column(db.Integer, primary_key=True)
    function_id = db.Column(db.Integer, db.ForeignKey('functions.id', ondelete='CASCADE'), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id', ondelete='CASCADE'), nullable=False)
    relation_type = db.Column(db.String(20), nullable=False)  # 'executor' | 'consumer' | 'supplier'
    description = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    function = db.relationship('Function', backref=db.backref('links', lazy=True, cascade='all, delete-orphan'))
    department = db.relationship('Department', backref=db.backref('links', lazy=True, cascade='all, delete-orphan'))
    created_by = db.relationship('User', lazy=True)

    __table_args__ = (
        db.UniqueConstraint('function_id', 'department_id', 'relation_type',
                            name='uq_function_department_relation'),
        db.CheckConstraint("relation_type in ('executor','consumer','supplier')",
                           name='ck_function_department_relation_type'),
    )


class Function(db.Model):
    """Функциональный элемент компании (Техническая, Коммерческая и т.д.)."""
    __tablename__ = 'functions'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    description = db.Column(db.Text)
    icon_key = db.Column(db.String(50))
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def executor_link(self):
        """Отдел-исполнитель этой функции (ровно один или None)."""
        return next((l for l in self.links if l.relation_type == 'executor'), None)

    @property
    def consumer_links(self):
        """Отделы-потребители этой функции."""
        return [l for l in self.links if l.relation_type == 'consumer']

    @property
    def supplier_links(self):
        """Отделы-поставщики для этой функции."""
        return [l for l in self.links if l.relation_type == 'supplier']


class Department(db.Model):
    """Отдел компании (многофункциональная единица)."""
    __tablename__ = 'departments'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    description = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = db.relationship('User', lazy=True)

    @property
    def executor_links(self):
        """Функции, которые исполняет этот отдел."""
        return [l for l in self.links if l.relation_type == 'executor']

    @property
    def consumer_links(self):
        """Функции, которые потребляет этот отдел."""
        return [l for l in self.links if l.relation_type == 'consumer']

    @property
    def supplier_links(self):
        """Функции, в которые поставляет этот отдел."""
        return [l for l in self.links if l.relation_type == 'supplier']


class Client(db.Model):
    """Компания/клиент."""
    __tablename__ = 'clients'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    assigned_employee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    briefs = db.relationship('Brief', backref='client', lazy=True, cascade="all, delete-orphan")
    profile = db.relationship('CompanyProfile', backref='client', uselist=False, cascade="all, delete-orphan")
    chat_sessions = db.relationship('ChatSession', backref='client', lazy=True, cascade="all, delete-orphan")


class Brief(db.Model):
    """Брифинг (документ с анкетой)."""
    __tablename__ = 'briefs'
    id = db.Column(db.Integer, primary_key=True)
    brief_type = db.Column(db.String(50), nullable=False)  # 'briefing', 'point_a', 'docs'
    status = db.Column(db.String(20), default='Не заполнено')
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sections = db.relationship('BriefSection', backref='brief', lazy=True, cascade="all, delete-orphan")


class BriefSection(db.Model):
    """Раздел брифа (структурированные данные вместо плоского JSON)."""
    __tablename__ = 'brief_sections'
    id = db.Column(db.Integer, primary_key=True)
    brief_id = db.Column(db.Integer, db.ForeignKey('briefs.id'), nullable=False)
    section_name = db.Column(db.String(100), nullable=False)
    section_order = db.Column(db.Integer)

    # Сырые данные от оператора
    data = db.Column(db.JSON)

    # Резюме для ИИ (генерируется при сохранении)
    ai_summary = db.Column(db.Text)

    # Метаданные
    is_critical = db.Column(db.Boolean, default=False)
    risk_flags = db.Column(db.JSON)  # {'cash_flow_issue': true, 'no_it': false}

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompanyProfile(db.Model):
    """Быстрый снимок компании для ИИ анализа."""
    __tablename__ = 'company_profiles'
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)

    # Краткое резюме всех брифов
    executive_summary = db.Column(db.Text)

    # Ключевые метрики для быстрого доступа
    metrics = db.Column(db.JSON)

    last_analyzed = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIAnalysisCache(db.Model):
    """Кеширование ответов ИИ для избежания повторных запросов."""
    __tablename__ = 'ai_analysis_cache'
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'))
    prompt_hash = db.Column(db.String(64))  # SHA256 хеш промпта
    response = db.Column(db.JSON)
    tokens_used = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ChatSession(db.Model):
    """Сессия чата с ИИ."""
    __tablename__ = 'chat_sessions'
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    session_token = db.Column(db.String(255), unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = db.relationship('ChatMessage', backref='session', lazy=True, cascade="all, delete-orphan")


class ChatMessage(db.Model):
    """Сообщение в чате."""
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('chat_sessions.id'), nullable=False)
    role = db.Column(db.String(20))  # 'user', 'assistant'
    content = db.Column(db.Text)
    tokens_used = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class AIAgent(db.Model):
    """ИИ-советник для функции."""
    __tablename__ = 'ai_agents'
    id = db.Column(db.Integer, primary_key=True)
    function_id = db.Column(db.Integer, db.ForeignKey('functions.id', ondelete='CASCADE'), nullable=False, unique=True)
    model = db.Column(db.String(50), default='claude-3.5-sonnet')
    temperature = db.Column(db.Float, default=0.7)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    function = db.relationship('Function', backref=db.backref('ai_agent', uselist=False, lazy=True))
    tasks = db.relationship('AITask', backref='agent', lazy=True, cascade='all, delete-orphan')


class AITask(db.Model):
    """Задача для ИИ-агента."""
    __tablename__ = 'ai_tasks'
    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey('ai_agents.id', ondelete='CASCADE'), nullable=False)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id', ondelete='CASCADE'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'in_progress', 'completed', 'failed'
    priority = db.Column(db.Integer, default=0)  # 0=low, 1=normal, 2=high
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = db.relationship('Client', lazy=True)
    runs = db.relationship('AIAgentRun', backref='task', lazy=True, cascade='all, delete-orphan')


class AIAgentRun(db.Model):
    """Выполнение задачи агентом."""
    __tablename__ = 'ai_agent_runs'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('ai_tasks.id', ondelete='CASCADE'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'running', 'completed', 'failed'
    input_prompt = db.Column(db.Text)
    output_response = db.Column(db.Text)
    error_message = db.Column(db.Text)
    tokens_used = db.Column(db.Integer, default=0)
    execution_time = db.Column(db.Float)  # в секундах
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)


class UserTask(db.Model):
    """Пользовательская задача с интеграцией в Яндекс.Календарь."""
    __tablename__ = 'user_tasks'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    assigned_to_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    input_data = db.Column(db.Text)
    start_time = db.Column(db.DateTime)
    duration_minutes = db.Column(db.Integer)
    expected_result = db.Column(db.Text)
    goal = db.Column(db.Text)
    action_description = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    calendar_event_uid = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = db.relationship('Client', backref=db.backref('tasks', lazy=True, cascade='all, delete-orphan'))
    assigned_to = db.relationship('User', foreign_keys=[assigned_to_id], lazy=True)
    completion = db.relationship('TaskCompletion', backref='task', uselist=False, cascade='all, delete-orphan')


class TaskCompletion(db.Model):
    """Результаты выполнения задачи."""
    __tablename__ = 'task_completions'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('user_tasks.id'), unique=True, nullable=False)
    actual_result = db.Column(db.Text)
    is_failure = db.Column(db.Boolean, default=False)
    difficulties = db.Column(db.Text)
    how_overcome = db.Column(db.Text)
    next_step = db.Column(db.Text)
    next_task_id = db.Column(db.Integer, db.ForeignKey('user_tasks.id'))
    completed_at = db.Column(db.DateTime, default=datetime.utcnow)

    next_task = db.relationship('UserTask', foreign_keys=[next_task_id], lazy=True)


class UserChatSession(db.Model):
    """Сессия чата пользователя с ИИ-ассистентом."""
    __tablename__ = 'user_chat_sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    context_type = db.Column(db.String(30), default='general')  # 'general', 'task_manager'
    context_id = db.Column(db.Integer)  # task_id при task_manager
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = db.relationship('UserChatMessage', backref='session', lazy=True, cascade='all, delete-orphan')


class UserChatMessage(db.Model):
    """Сообщение в чате пользователя."""
    __tablename__ = 'user_chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('user_chat_sessions.id'), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # 'user', 'assistant'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
