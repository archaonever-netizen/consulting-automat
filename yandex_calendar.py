"""Интеграция с Яндекс.Календарём через CalDAV и OAuth.

TODO: интеграция запланирована, требует переноса с Flask на текущий стек.
Модуль написан для старого Flask-приложения и сейчас НЕ подключён к бэкенду.
Что уже готово к переносу: поля токенов в backend/models.py (User), настройки
в backend/core/config.py (yandex_*), инструкции в docs/archive/YANDEX_CALENDAR_SETUP.md.
При переносе: переписать на async (httpx вместо requests), подключить к
backend/services/tasks.py, шифровать токены через backend/core/crypto.py.
"""

import os
import requests
from datetime import datetime, timedelta
from urllib.parse import urlencode

try:
    import caldav
    CALDAV_AVAILABLE = True
except ImportError:
    print("[CALENDAR] Warning: caldav not installed, calendar integration disabled")
    CALDAV_AVAILABLE = False


YANDEX_OAUTH_AUTH_URL = 'https://oauth.yandex.ru/authorize'
YANDEX_OAUTH_TOKEN_URL = 'https://oauth.yandex.ru/token'
CALDAV_URL_TEMPLATE = 'https://caldav.yandex.ru/{login}/'
CALENDAR_NAME = 'calendar'


def get_oauth_url():
    """Получить URL для редиректа на Яндекс OAuth."""
    client_id = os.getenv('YANDEX_CLIENT_ID')
    redirect_uri = os.getenv('YANDEX_REDIRECT_URI')

    if not client_id or not redirect_uri:
        raise ValueError('YANDEX_CLIENT_ID and YANDEX_REDIRECT_URI must be set')

    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'state': 'task_manager',
        'scope': 'calendar:api',  # полный доступ к календарю
    }
    return f"{YANDEX_OAUTH_AUTH_URL}?{urlencode(params)}"


def exchange_code(code):
    """Обменять код на токен доступа и данные пользователя.

    Returns:
        dict: {access_token, refresh_token, expires_in, login}
        или raises Exception при ошибке
    """
    client_id = os.getenv('YANDEX_CLIENT_ID')
    client_secret = os.getenv('YANDEX_CLIENT_SECRET')
    redirect_uri = os.getenv('YANDEX_REDIRECT_URI')

    if not all([client_id, client_secret, redirect_uri]):
        raise ValueError('Yandex OAuth env vars not set')

    payload = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
    }

    resp = requests.post(YANDEX_OAUTH_TOKEN_URL, data=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    # Получить логин пользователя из API
    user_info = requests.get(
        'https://login.yandex.ru/info',
        params={'format': 'json'},
        headers={'Authorization': f"OAuth {data['access_token']}"},
        timeout=10
    )
    user_info.raise_for_status()
    login = user_info.json()['login']

    return {
        'access_token': data['access_token'],
        'refresh_token': data.get('refresh_token'),
        'expires_in': data.get('expires_in', 3600),
        'login': login,
    }


def refresh_token_if_needed(user):
    """Обновить токен доступа если истёк.

    Args:
        user: User model instance

    Returns:
        bool: True если токен был обновлён или всё в порядке, False если нет токена
    """
    if not user.yandex_calendar_token:
        return False

    # Если токена нет даты истечения или она в будущем — ничего не делаем
    if not user.yandex_calendar_token_expiry:
        return True

    if datetime.utcnow() < user.yandex_calendar_token_expiry:
        return True

    # Токен истёк — пытаемся обновить
    if not user.yandex_calendar_refresh_token:
        return False

    try:
        client_id = os.getenv('YANDEX_CLIENT_ID')
        client_secret = os.getenv('YANDEX_CLIENT_SECRET')

        payload = {
            'grant_type': 'refresh_token',
            'refresh_token': user.yandex_calendar_refresh_token,
            'client_id': client_id,
            'client_secret': client_secret,
        }

        resp = requests.post(YANDEX_OAUTH_TOKEN_URL, data=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        user.yandex_calendar_token = data['access_token']
        if 'refresh_token' in data:
            user.yandex_calendar_refresh_token = data['refresh_token']
        user.yandex_calendar_token_expiry = datetime.utcnow() + timedelta(
            seconds=data.get('expires_in', 3600)
        )
        return True
    except Exception:
        return False


def create_event(user, task):
    """Создать событие в Яндекс.Календаре и вернуть UID.

    Args:
        user: User model instance с токеном Яндекса
        task: UserTask model instance

    Returns:
        str: UID события в календаре

    Raises:
        Exception при ошибке создания события
    """
    if not user.yandex_calendar_token or not user.yandex_login:
        raise ValueError('User not connected to Yandex Calendar')

    # Обновить токен если нужно
    if not refresh_token_if_needed(user):
        raise ValueError('Failed to refresh Yandex token')

    # Подключиться к CalDAV
    caldav_url = CALDAV_URL_TEMPLATE.format(login=user.yandex_login)
    client = caldav.DAVClient(
        caldav_url,
        headers={'Authorization': f"OAuth {user.yandex_calendar_token}"}
    )

    # Найти основной календарь
    principal = client.principal()
    calendars = principal.calendars()

    if not calendars:
        raise ValueError('No calendars found')

    calendar = calendars[0]

    # Построить iCal событие
    # Если нет start_time, использовать текущее время
    start = task.start_time or datetime.now()
    duration = timedelta(minutes=task.duration_minutes or 60)
    end = start + duration

    # Форматировать описание
    desc_parts = []
    if task.input_data:
        desc_parts.append(f"📋 Вводные данные: {task.input_data}")
    if task.goal:
        desc_parts.append(f"🎯 Цель: {task.goal}")
    if task.action_description:
        desc_parts.append(f"⚡ Действие: {task.action_description}")
    if task.expected_result:
        desc_parts.append(f"✅ Ожидаемый результат: {task.expected_result}")
    if task.duration_minutes:
        desc_parts.append(f"⏱ Длительность: {task.duration_minutes} мин.")

    description = '\n'.join(desc_parts) if desc_parts else task.title

    # Создать iCal компонент вручную (caldav может быть сложным)
    from icalendar import Calendar, Event

    cal = Calendar()
    cal.add('prodid', '-//ШЕФ//Task Manager//RU')
    cal.add('version', '2.0')

    event = Event()
    event.add('uid', f"task-{task.id}-{int(datetime.now().timestamp())}@chef.local")
    event.add('summary', task.title)
    event.add('dtstart', start)
    event.add('dtend', end)
    event.add('description', description)
    event.add('created', datetime.now())

    cal.add_component(event)

    # Сохранить событие
    ics_data = cal.to_ical()
    calendar.add_event(ics_data)

    return event['uid']


def delete_event(user, event_uid):
    """Удалить событие из календаря.

    Args:
        user: User model instance
        event_uid: UID события для удаления

    Returns:
        bool: True если успешно, False если событие не найдено или ошибка
    """
    if not user.yandex_calendar_token or not user.yandex_login:
        return False

    if not refresh_token_if_needed(user):
        return False

    try:
        caldav_url = CALDAV_URL_TEMPLATE.format(login=user.yandex_login)
        client = caldav.DAVClient(
            caldav_url,
            headers={'Authorization': f"OAuth {user.yandex_calendar_token}"}
        )

        principal = client.principal()
        calendars = principal.calendars()

        if not calendars:
            return False

        calendar = calendars[0]

        # Поиск события по UID
        search_result = calendar.search(event_uid, expand=False)
        if search_result:
            search_result[0].delete()
            return True

        return False
    except Exception:
        return False
