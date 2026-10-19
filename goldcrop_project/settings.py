from pathlib import Path
import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

IS_VERCEL = os.environ.get('VERCEL') == '1'

DEBUG = os.environ.get('DEBUG', 'false' if IS_VERCEL else 'true').lower() in {
    '1',
    'true',
    'yes',
}
if IS_VERCEL and DEBUG:
    raise ImproperlyConfigured('DEBUG must be disabled for Vercel deployments.')


def _csv_environment(name):
    return [value.strip() for value in os.environ.get(name, '').split(',') if value.strip()]


def _vercel_hostname(name):
    value = os.environ.get(name, '').strip()
    if not value:
        return None
    parsed = urlsplit(value if '://' in value else f'//{value}')
    if parsed.scheme not in {'', 'http', 'https'}:
        raise ImproperlyConfigured(f'{name} must contain a valid hostname.')
    return parsed.hostname


SECRET_KEY = os.environ.get('SECRET_KEY', '').strip()
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('Configure a unique, secret SECRET_KEY in the production environment.')
    SECRET_KEY = 'django-insecure-goldcrop-local-development'
if not DEBUG and (
    len(SECRET_KEY) < 50
    or len(set(SECRET_KEY)) < 5
    or SECRET_KEY.startswith('django-insecure-')
):
    raise ImproperlyConfigured('Production SECRET_KEY must be a unique random value of at least 50 characters.')

vercel_hosts = {
    host for host in (
        _vercel_hostname('VERCEL_URL'),
        _vercel_hostname('VERCEL_PROJECT_PRODUCTION_URL'),
    ) if host
}
ALLOWED_HOSTS = list(dict.fromkeys([
    'gold-crop.vercel.app',
    'localhost',
    '127.0.0.1',
    *_csv_environment('ALLOWED_HOSTS'),
    *sorted(vercel_hosts),
]))
if not DEBUG and '*' in ALLOWED_HOSTS:
    raise ImproperlyConfigured('Wildcard ALLOWED_HOSTS is not permitted in production.')
CSRF_TRUSTED_ORIGINS = list(dict.fromkeys([
    *_csv_environment('CSRF_TRUSTED_ORIGINS'),
    *(f'https://{host}' for host in sorted(vercel_hosts)),
]))

SECURE_SSL_REDIRECT = os.environ.get(
    'SECURE_SSL_REDIRECT', 'false' if DEBUG else 'true',
).lower() in {'1', 'true', 'yes'}
SESSION_COOKIE_SECURE = os.environ.get(
    'SESSION_COOKIE_SECURE', 'false' if DEBUG else 'true',
).lower() in {'1', 'true', 'yes'}
CSRF_COOKIE_SECURE = os.environ.get(
    'CSRF_COOKIE_SECURE', 'false' if DEBUG else 'true',
).lower() in {'1', 'true', 'yes'}
try:
    SECURE_HSTS_SECONDS = int(os.environ.get(
        'SECURE_HSTS_SECONDS', '0' if DEBUG else '31536000',
    ))
except ValueError as error:
    raise ImproperlyConfigured('SECURE_HSTS_SECONDS must be an integer.') from error
if SECURE_HSTS_SECONDS < 0:
    raise ImproperlyConfigured('SECURE_HSTS_SECONDS cannot be negative.')
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.environ.get(
    'SECURE_HSTS_INCLUDE_SUBDOMAINS', 'false',
).lower() in {'1', 'true', 'yes'}
SECURE_HSTS_PRELOAD = os.environ.get(
    'SECURE_HSTS_PRELOAD', 'false',
).lower() in {'1', 'true', 'yes'}
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
if not DEBUG and (
    not SECURE_SSL_REDIRECT
    or not SESSION_COOKIE_SECURE
    or not CSRF_COOKIE_SECURE
    or SECURE_HSTS_SECONDS == 0
):
    raise ImproperlyConfigured(
        'Production requires HTTPS redirects, secure session/CSRF cookies, and nonzero HSTS.'
    )
TRUST_X_FORWARDED_PROTO = os.environ.get(
    'TRUST_X_FORWARDED_PROTO', 'true' if IS_VERCEL else 'false',
).lower() in {'1', 'true', 'yes'}
if TRUST_X_FORWARDED_PROTO:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'dashboard',
    'pecuaria',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'goldcrop_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'goldcrop_project.wsgi.application'

database_url = (
    os.environ.get('DATABASE_URL')
    or os.environ.get('POSTGRES_URL')
    or os.environ.get('STORAGE_URL')
)
if database_url:
    import dj_database_url

    DATABASES = {
        'default': dj_database_url.parse(
            database_url,
            conn_max_age=0 if IS_VERCEL else 600,
            ssl_require=not DEBUG,
        )
    }
elif IS_VERCEL:
    raise ImproperlyConfigured(
        'Configure DATABASE_URL, POSTGRES_URL, or STORAGE_URL with a persistent '
        'PostgreSQL database in Vercel.'
    )
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]
LOGIN_URL = 'dashboard:login'
LOGIN_REDIRECT_URL = 'dashboard:dashboard'
LOGOUT_REDIRECT_URL = 'dashboard:login'
LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() in {'1', 'true', 'yes'}
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'false').lower() in {'1', 'true', 'yes'}
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', '')
