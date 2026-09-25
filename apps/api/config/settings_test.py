import os
os.environ.setdefault("SECRET_KEY", "isolated-test-secret-not-for-production")
from .settings import *  # noqa: F403,F401
if not os.environ.get("FLEET_TEST_MYSQL"):
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK["TEST_REQUEST_DEFAULT_FORMAT"] = "json"
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
