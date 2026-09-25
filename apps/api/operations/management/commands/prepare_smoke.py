from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

class Command(BaseCommand):
    help = "Provision an isolated browser-test account; only allowed in settings_smoke"
    def handle(self, *args, **options):
        if not getattr(settings, "SMOKE_TEST", False):
            raise CommandError("This command is restricted to the disposable smoke profile")
        if not User.objects.filter(username="fleet-test").exists():
            User.objects.create_superuser("fleet-test", password="fleet-test-password")
        self.stdout.write("Disposable smoke account ready")
