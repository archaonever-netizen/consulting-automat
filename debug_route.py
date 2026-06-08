#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Debug login route."""

from app import app
from models import User, db

# Test client
client = app.test_client()

print("[DEBUG] Testing /login route...")

# Test 1: GET /login
print("\n1. GET /login...")
response = client.get('/login')
print(f"   Status: {response.status_code}")
if response.status_code == 200:
    print("   [OK] Login page loads")
else:
    print(f"   [ERROR] Got status {response.status_code}")

# Test 2: POST /login with valid credentials
print("\n2. POST /login with valid credentials...")
try:
    response = client.post('/login', data={
        'email': 'founder@shef.local',
        'password': 'founder-password'
    }, follow_redirects=False)
    print(f"   Status: {response.status_code}")
    print(f"   Location: {response.headers.get('Location', 'None')}")

    if response.status_code == 302:
        print("   [OK] Redirect received")
    else:
        print(f"   [ERROR] Expected 302, got {response.status_code}")
        print(f"   Response data: {response.data.decode()[:500]}")
except Exception as e:
    print(f"   [ERROR] Exception: {e}")
    import traceback
    traceback.print_exc()

print("\n[DONE]")
