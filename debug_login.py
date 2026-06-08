#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Debug login process."""

from app import app
from models import User

with app.app_context():
    print("[DEBUG] Testing login process...")

    # Test 1: Get founder
    print("\n1. Looking for founder...")
    founder = User.query.filter_by(email='founder@shef.local').first()
    if founder:
        print(f"   [OK] Found founder: {founder.full_name}")
    else:
        print("   [ERROR] Founder not found")
        exit(1)

    # Test 2: Check password
    print("\n2. Testing password check...")
    pwd = 'founder-password'
    is_valid = founder.check_password(pwd)
    print(f"   Password '{pwd}': {is_valid}")

    if not is_valid:
        print("   [ERROR] Password check failed!")
        print(f"   Hash: {founder.password_hash[:50]}...")
        exit(1)

    print("\n[OK] Login test passed!")
