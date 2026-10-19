import os

import django
from django.core.management import call_command


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "goldcrop_project.settings")
    django.setup()

    call_command("check", deploy=True)
    call_command("makemigrations", check=True, dry_run=True)

    if os.environ.get("VERCEL") == "1":
        vercel_environment = os.environ.get("VERCEL_ENV")
        if vercel_environment not in {"production", "preview", "development"}:
            raise RuntimeError("Vercel build is missing a valid VERCEL_ENV value.")
        if vercel_environment == "production":
            call_command("migrate", interactive=False)
        else:
            print(f"Skipping database migrations for Vercel {vercel_environment} deployment.")
    else:
        print("Skipping database migrations outside a Vercel production deployment.")


if __name__ == "__main__":
    main()
