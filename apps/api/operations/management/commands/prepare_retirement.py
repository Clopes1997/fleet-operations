import os
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User, Permission
class Command(BaseCommand):
    help="Create ephemeral rehearsal roles only in an explicitly disposable database"
    def handle(self,*args,**kwargs):
        if os.environ.get("FLEET_MIGRATION_DISPOSABLE")!="1" or not settings.DATABASES["default"]["NAME"].startswith("rehearsal_"):
            raise CommandError("Disposable target required")
        password=os.environ["FLEET_REHEARSAL_PASSWORD"]
        if len(password)<32: raise CommandError("Random rehearsal credential required")
        User.objects.create_superuser("rehearsal",password=password)
        viewer=User.objects.create_user("rehearsal-viewer",password=password)
        viewer.user_permissions.add(*Permission.objects.filter(codename__in=["view_customer","view_truck","view_serviceorder"]))
        self.stdout.write("Disposable roles prepared")

