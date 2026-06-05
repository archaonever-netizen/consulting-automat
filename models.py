# models.py
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Client(db.Model):
    """Компания/клиент."""
    __tablename__ = 'clients'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
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
