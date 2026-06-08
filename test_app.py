#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test script to verify app initialization."""
import sys

from app import app, db
from models import User, Role, Function, Department

print("[OK] Models imported successfully")

with app.app_context():
    print("[OK] App context created")
    try:
        db.create_all()
        print("[OK] Database tables created/verified")
    except Exception as e:
        print(f"[ERROR] Database error: {e}")
        sys.exit(1)

print("\n[OK] All systems OK - ready to proceed")
