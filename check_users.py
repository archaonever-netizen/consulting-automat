#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check users and roles in database."""

from app import app, db
from models import User, Role

with app.app_context():
    print('=== Таблица users ===')
    users = User.query.all()
    print(f'Всего пользователей: {len(users)}')
    for u in users:
        print(f'  - ID: {u.id}')
        print(f'    Email: {u.email}')
        print(f'    Имя: {u.full_name}')
        print(f'    Founder: {u.is_founder}')
        print(f'    Активен: {u.is_active}')
        print(f'    Роль: {u.role.name if u.role else "нет"}')
        print()

    print('=== Таблица roles ===')
    roles = Role.query.all()
    print(f'Всего ролей: {len(roles)}')
    for r in roles:
        print(f'  - {r.name}: {r.description}')
