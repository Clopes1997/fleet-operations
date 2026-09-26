import copy
import json
import os
from pathlib import Path
from django.test import TestCase
from django.contrib.auth.models import User, Permission
from rest_framework.test import APIClient
from .reconciliation import preflight, apply_reviewed, reconcile, digest
from .models import Customer, ServiceOrder, OrderTransition, ImportRecord
from trucks.models import Truck

class RetirementAcceptance(TestCase):
    def source(self):
        configured = os.environ.get("FLEET_RETIREMENT_FIXTURE")
        fixture = Path(configured) if configured else Path(__file__).resolve().parents[3] / "tools/migration/fixtures/fleet-source.json"
        return json.loads(fixture.read_text())
    def test_import_exact_money_references_history_and_repeat(self):
        source = self.source()
        self.assertEqual(preflight(source)[2]["status"], "PASS")
        self.assertEqual(apply_reviewed(source)["imported"], 5)
        self.assertEqual(apply_reviewed(source)["repeated"], 5)
        result = reconcile(source)
        self.assertEqual(result["status"], "PASS", result)
        self.assertEqual(result["totals"]["source"], {"quotes": "0.29", "valuations": "123456.78"})
        self.assertEqual(result["totals"]["source"], result["totals"]["target"])
        order = ServiceOrder.objects.get()
        self.assertEqual(order.customer.display_name, "Synthetic customer")
        self.assertEqual(order.vehicle.license_plate, "ABC1D23")
        self.assertEqual(OrderTransition.objects.get().occurred_at.isoformat(), "2024-01-02T15:00:00+00:00")
        self.assertEqual(ImportRecord.objects.get(entity="reviewed-history").payload["raw"], source["rows"][3])
    def test_duplicates_missing_refs_precision_naive_timestamps_fail_atomically(self):
        source = self.source()
        variations = []
        duplicate=copy.deepcopy(source); duplicate["rows"].append(copy.deepcopy(duplicate["rows"][0])); variations.append(duplicate)
        for field,value in [("customer","missing"),("quoted_value","1.001"),("created_at","2024-01-01T12:00:00")]:
            changed=copy.deepcopy(source); changed["rows"][2][field]=value; variations.append(changed)
        for changed in variations:
            self.assertEqual(preflight(changed)[2]["status"],"FAIL")
            with self.assertRaises(ValueError): apply_reviewed(changed)
        self.assertEqual(Customer.objects.count(),0)
    def test_possible_customer_duplicate_requires_reusable_review(self):
        source=self.source()
        Customer.objects.create(display_name="Synthetic customer",notes="Fixture only")
        review=preflight(source)[2]
        self.assertEqual(review["records"][0]["classification"],"possible_duplicate")
        candidate=review["records"][0]["candidates"][0]
        decisions={"sourceSha256":digest(source),"decisions":{"customer:c1":{"action":"map",**candidate}}}
        self.assertEqual(preflight(source,decisions)[2]["status"],"PASS")
        apply_reviewed(source,decisions); apply_reviewed(source,decisions)
        self.assertEqual(Customer.objects.count(),1)
        self.assertEqual(reconcile(source)["status"],"PASS")
        decisions["sourceSha256"]="changed"
        with self.assertRaises(ValueError): preflight(source,decisions)
    def test_active_plate_and_archived_collisions_never_auto_merge(self):
        source=self.source()
        source["rows"].append({**source["rows"][1],"id":"duplicate"})
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
        decisions={"sourceSha256":digest(source),"decisions":{"vehicle:v1":{"action":"new"},"vehicle:duplicate":{"action":"new"}}}
        self.assertEqual(preflight(source,decisions)[2]["status"],"REQUIRES_REVIEW")
        with self.assertRaises(ValueError): apply_reviewed(source,decisions)
        source=self.source()
        Truck.all_objects.create(license_plate="ABC1D23",brand="Old",model="Old",manufacturing_year=2000,deleted_at="2020-01-01T00:00:00Z")
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
    def test_changed_target_and_deferred_or_skipped_reference_blocks(self):
        source=self.source(); apply_reviewed(source)
        Customer.objects.update(notes="Changed")
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
        self.assertEqual(reconcile(source)["status"],"FAIL")
        source["installation"]="another"
        decisions={"sourceSha256":digest(source),"decisions":{"customer:c1":{"action":"skip","reason":"Owner archival decision"}}}
        self.assertEqual(preflight(source,decisions)[2]["status"],"FAIL")
    def test_imported_visibility_roles_lifecycle_and_conflicting_plate(self):
        source=self.source(); apply_reviewed(source)
        client=APIClient()
        self.assertEqual(client.get("/api/orders/").status_code,403)
        viewer=User.objects.create_user("retirement-viewer")
        viewer.user_permissions.add(*Permission.objects.filter(codename__in=["view_serviceorder","view_customer","view_truck"]))
        client.force_authenticate(viewer)
        self.assertEqual(client.get("/api/orders/").status_code,200)
        self.assertEqual(client.get("/api/customers/").status_code,200)
        self.assertEqual(client.get("/api/trucks/").status_code,200)
        self.assertEqual(client.post("/api/customers/",{"display_name":"Denied"}).status_code,403)
        admin=User.objects.create_superuser("retirement-admin",password="isolated-test-password")
        client.force_authenticate(admin)
        order=ServiceOrder.objects.get()
        result=client.patch("/api/orders/"+str(order.pk)+"/",{"status":"concluido","version":0})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(OrderTransition.objects.count(),2)
        self.assertEqual(client.post("/api/trucks/",{"license_plate":"ABC1D23","brand":"Other","model":"Other","manufacturing_year":2020}).status_code,400)
    def test_history_gaps_require_review(self):
        source=self.source()
        source["rows"][3]["next_status"]="concluido"
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
    def test_skipped_financial_values_remain_in_source_totals(self):
        source=self.source()
        source["rows"].append({"type":"order","id":"archival","customer_snapshot":"Archived only","description":"Evidence","quoted_value":"12.34","deadline":"2024-01-01","status":"concluido"})
        decisions={"sourceSha256":digest(source),"decisions":{"order:archival":{"action":"skip","reason":"Explicit owner review"}}}
        apply_reviewed(source,decisions)
        report=reconcile(source)
        self.assertEqual(report["status"],"REQUIRES_REVIEW")
        self.assertEqual(report["totals"]["source"]["quotes"],"12.63")
        self.assertEqual(report["totals"]["target"]["quotes"],"0.29")
        self.assertEqual(report["counts"]["target"]["vehicleArchived"],1)
    def test_invalid_fipe_metadata_cannot_break_target_serialization(self):
        source=self.source();source["rows"][1]["fipe_metadata"]="invalid"
        self.assertEqual(preflight(source)[2]["status"],"FAIL")
    def test_equal_history_timestamps_require_review(self):
        source=self.source()
        source["rows"].append({**source["rows"][3],"id":"h2","previous_status":"em_andamento","next_status":"concluido"})
        source["rows"][2]["status"]="concluido"
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
    def test_database_foreign_key_fields_cannot_be_silently_discarded(self):
        source=self.source();source["rows"][2].pop("customer");source["rows"][2]["customer_id"]=1
        self.assertEqual(preflight(source)[2]["status"],"FAIL")
    def test_removed_source_rows_require_review(self):
        source=self.source();apply_reviewed(source)
        source["rows"]=source["rows"][:-1]
        self.assertEqual(preflight(source)[2]["status"],"REQUIRES_REVIEW")
        self.assertEqual(reconcile(source)["status"],"FAIL")
    def test_active_customer_cannot_map_to_archived_target(self):
        source=self.source()
        Customer.objects.create(display_name="Synthetic customer",notes="Fixture only",deleted_at="2020-01-01T00:00:00Z")
        candidate=preflight(source)[2]["records"][0]["candidates"][0]
        decision={"sourceSha256":digest(source),"decisions":{"customer:c1":{"action":"map",**candidate}}}
        self.assertEqual(preflight(source,decision)[2]["status"],"FAIL")
