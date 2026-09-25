"""Disposable browser-test profile. Never use for real data."""
from .settings_local import *  # noqa: F403,F401
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / ".smoke.sqlite3"}}  # noqa: F405
SMOKE_TEST = True
