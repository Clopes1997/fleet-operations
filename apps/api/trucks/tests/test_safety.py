from decimal import Decimal
from unittest.mock import patch, Mock
import requests
from django.db import connection, IntegrityError, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from trucks.models import Truck
from trucks.serializers import TruckSerializer
from trucks.services.fipe_client import FipeClient, FipeUnavailable

class FleetSafetyTests(TestCase):
    def test_null_plate_is_validation_error(self):
        serializer = TruckSerializer(data={"license_plate": None, "brand": "A", "model": "B", "manufacturing_year": 2020})
        self.assertFalse(serializer.is_valid())
        self.assertIn("license_plate", serializer.errors)

    def test_database_rejects_plate_desynchronization_and_restore_collision(self):
        old = Truck.objects.create(license_plate="ABC1234", brand="A", model="B", manufacturing_year=2020)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Truck.objects.filter(pk=old.pk).update(license_plate="XYZ1234")
        old.soft_delete()
        Truck.objects.create(license_plate="ABC1234", brand="A", model="B", manufacturing_year=2021)
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            old.restore()

    @patch("trucks.services.fipe_client.requests.get")
    def test_external_timeout_and_malformed_price_are_distinct_from_validation(self, request):
        request.side_effect = requests.Timeout()
        with self.assertRaises(FipeUnavailable):
            FipeClient.get_brands()
        request.side_effect = None
        response = Mock()
        response.json.return_value = {"price": "NaN"}
        request.return_value = response
        with self.assertRaises(FipeUnavailable):
            FipeClient.get_price("trucks", "1", "2", "2020-1")

    @patch.object(FipeClient, "get_models")
    def test_partial_or_ambiguous_names_do_not_select_a_model(self, models):
        models.return_value = [{"code": "1", "name": "FH 460"}, {"code": "2", "name": "FH 540"}]
        self.assertIsNone(FipeClient.validate_model("1", "FH"))
        models.return_value = [{"code": "1", "name": "FH"}, {"code": "2", "name": "FH"}]
        self.assertIsNone(FipeClient.validate_model("1", "FH"))

class FleetMigrationTests(TransactionTestCase):
    old = [("trucks", "0002_truck_deleted_at_alter_truck_license_plate_and_more")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        self.latest = executor.loader.graph.leaf_nodes()
        executor.migrate(self.old)
        self.old_model = executor.loader.project_state(self.old).apps.get_model("trucks", "Truck")

    def tearDown(self):
        # Repair only this test fixture so the test database can return to the current schema.
        self.old_model.objects.filter(license_plate="BROKEN").update(license_plate="FIX1234")
        MigrationExecutor(connection).migrate(self.latest)
        super().tearDown()

    def test_populated_upgrade_preserves_values_and_archives(self):
        active = self.old_model.objects.create(license_plate="ABC1234", brand="Legacy", model="Truck", manufacturing_year=2020, fipe_price=Decimal("123.45"))
        archived = self.old_model.objects.create(license_plate="DEF1234", brand="Archived", model="Truck", manufacturing_year=2019, fipe_price=Decimal("45.67"), deleted_at=timezone.now())
        MigrationExecutor(connection).migrate(self.latest)
        current = Truck.all_objects.get(pk=active.pk)
        self.assertEqual(current.fipe_price, Decimal("123.45"))
        self.assertEqual(current.active_plate, "ABC1234")
        self.assertIsNotNone(Truck.all_objects.get(pk=archived.pk).deleted_at)

    def test_invalid_source_stops_before_mutating_legacy_row(self):
        row = self.old_model.objects.create(license_plate="BROKEN", brand="Legacy", model="Truck", manufacturing_year=2020, fipe_price=Decimal("123.45"))
        with self.assertRaisesRegex(RuntimeError, "Reconcile"):
            MigrationExecutor(connection).migrate(self.latest)
        self.assertEqual(self.old_model.objects.get(pk=row.pk).license_plate, "BROKEN")
