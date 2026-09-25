"""Explicit local-only profile. Never use for a hosted installation."""
import os
os.environ.setdefault("SECRET_KEY", "local-development-key-not-for-production-0000000000000000")
os.environ.setdefault("DEBUG", "true")
from .settings import *  # noqa: F403,F401
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "local.sqlite3"}}  # noqa: F405
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
