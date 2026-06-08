"""
Скрипт для создания аккаунта Founder.
Использование: python seed_founder.py

Переменные окружения (из .env.local):
- FOUNDER_EMAIL: email основателя
- FOUNDER_PASSWORD: пароль основателя
- FOUNDER_NAME: полное имя основателя
"""

import sys
sys.path.insert(0, '.')

from app import app, db
from models import User
from dotenv import load_dotenv
import os

load_dotenv('.env.local')

def seed_founder():
    """Создать Founder-аккаунт (идемпотентно)."""
    email = os.environ.get('FOUNDER_EMAIL', 'founder@shef.local')
    password = os.environ.get('FOUNDER_PASSWORD', 'founder-password-change-me')
    full_name = os.environ.get('FOUNDER_NAME', 'Основатель')

    with app.app_context():
        # Проверить, существует ли уже Founder
        existing_founder = User.query.filter_by(is_founder=True).first()
        if existing_founder:
            print(f"✓ Founder уже существует: {existing_founder.email} ({existing_founder.full_name})")
            return

        # Проверить, нет ли пользователя с таким email
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            print(f"✗ Ошибка: пользователь с email {email} уже существует (но is_founder=False)")
            print("  Не повышаю существующего пользователя до Founder автоматически.")
            sys.exit(1)

        # Создать Founder
        try:
            founder = User(
                email=email,
                full_name=full_name,
                is_founder=True,
                is_active=True,
                role_id=None
            )
            founder.set_password(password)
            db.session.add(founder)
            db.session.commit()
            print(f"✓ Founder создан успешно:")
            print(f"  Email: {email}")
            print(f"  Имя: {full_name}")
            print(f"  ID: {founder.id}")
        except Exception as e:
            print(f"✗ Ошибка при создании Founder: {e}")
            sys.exit(1)

if __name__ == '__main__':
    seed_founder()
