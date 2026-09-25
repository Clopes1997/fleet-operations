import json
import os
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from operations.reconciliation import preflight, apply_reviewed, reconcile

class Command(BaseCommand):
    help = "Preflight/reconcile snapshots, or import only into an explicitly disposable target."
    def add_arguments(self, parser):
        parser.add_argument("stage", choices=["preflight", "import", "reconcile"])
        parser.add_argument("--snapshot", required=True)
        parser.add_argument("--decisions")
        parser.add_argument("--out", required=True)
    def handle(self, *args, **options):
        # No command in this workflow may write against an ordinary/legacy database.
        if os.environ.get("FLEET_MIGRATION_DISPOSABLE") != "1" or not settings.DATABASES["default"]["NAME"].startswith("rehearsal_"):
            raise CommandError("Requires FLEET_MIGRATION_DISPOSABLE=1 and a rehearsal_ database; use the root disposable runner")
        output = Path(options["out"])
        if output.exists():
            raise CommandError("Evidence output already exists")
        try:
            raw = json.loads(Path(options["snapshot"]).read_text(encoding="utf-8-sig"))
            decisions = json.loads(Path(options["decisions"]).read_text(encoding="utf-8-sig")) if options["decisions"] else None
            if options["stage"] == "preflight":
                result = preflight(raw, decisions)[2]
            elif options["stage"] == "import":
                result = apply_reviewed(raw, decisions)
            else:
                result = reconcile(raw)
            with output.open("x", encoding="utf-8") as handle:
                json.dump(result, handle, indent=2)
            self.stdout.write("Evidence written")
        except (ValueError, KeyError, TypeError):
            raise CommandError("Invalid source or unresolved decisions; inspect preflight evidence")

