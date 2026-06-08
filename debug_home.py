#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Debug home route after login."""

from app import app

client = app.test_client()

print("[DEBUG] Testing /home route after login...")

# Login first
print("\n1. Logging in...")
response = client.post('/login', data={
    'email': 'founder@shef.local',
    'password': 'founder-password'
}, follow_redirects=False)
print(f"   Login response: {response.status_code}")

# Get session cookie
print("\n2. Getting session cookie...")
cookies = response.headers.getlist('Set-Cookie')
if cookies:
    print(f"   [OK] Got {len(cookies)} cookies")
else:
    print("   [WARNING] No cookies set")

# Try to access /
print("\n3. Accessing / (home)...")
try:
    response = client.get('/', follow_redirects=True)
    print(f"   Status: {response.status_code}")

    if response.status_code == 200:
        print("   [OK] Home page loads")
    else:
        print(f"   [ERROR] Got status {response.status_code}")
        # Show first 1000 chars of response
        data = response.data.decode()
        if 'Internal Server Error' in data:
            print("   [ERROR] Got Internal Server Error!")
            # Try to find error message
            if 'Traceback' in data:
                lines = data.split('\n')
                for i, line in enumerate(lines):
                    if 'Traceback' in line:
                        print('\n   '.join(lines[i:min(i+20, len(lines))]))
                        break
except Exception as e:
    print(f"   [ERROR] Exception: {e}")
    import traceback
    traceback.print_exc()

print("\n[DONE]")
