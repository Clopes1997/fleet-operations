from decimal import Decimal
from django.contrib.auth.models import User, Permission
from django.test import TestCase
from rest_framework.test import APIClient
from trucks.models import Truck
from .models import ServiceOrder, OrderTransition

class OperationsTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("operator", password="isolated-test-password")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.data = dict(customer_snapshot="Original customer", description="Repair", quoted_value="12.34", deadline="2020-01-01")

    def test_anonymous_and_model_permissions(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/orders/").status_code, 403)
        viewer = User.objects.create_user("viewer")
        viewer.user_permissions.add(Permission.objects.get(codename="view_serviceorder"))
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.get("/api/orders/").status_code, 200)
        self.assertEqual(self.client.post("/api/orders/", self.data).status_code, 403)

    def test_csrf_required_for_login_and_writes(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(client.post("/api/login/", {"username": "operator", "password": "isolated-test-password"}, format="json").status_code, 403)
        token = client.get("/api/session/").json()["csrfToken"]
        self.assertEqual(client.post("/api/login/", {"username": "operator", "password": "isolated-test-password"}, format="json", HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.assertEqual(client.post("/api/orders/", self.data, format="json").status_code, 403)
        token = client.get("/api/session/").json()["csrfToken"]
        self.assertEqual(client.post("/api/orders/", self.data, format="json", HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_overdue_edits_lifecycle_and_history(self):
        response = self.client.post("/api/orders/", self.data)
        self.assertEqual(response.status_code, 201, response.data)
        url = f"/api/orders/{response.data['id']}/"
        self.assertEqual(self.client.patch(url, {"description": "Updated", "version": 0}).status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "em_andamento", "version": 1}).status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "em_andamento", "version": 2}).status_code, 200)
        self.assertEqual(OrderTransition.objects.count(), 1)
        self.assertEqual(self.client.patch(url, {"status": "concluido", "version": 3}).status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "pendente", "version": 4}).status_code, 400)
        self.assertEqual(self.client.patch(url, {"description": "stale", "version": 0}).status_code, 400)
        self.assertEqual(OrderTransition.objects.count(), 2)

    def test_archived_vehicle_preserves_linked_history(self):
        truck = Truck.objects.create(license_plate="ABC1234", brand="A", model="B", manufacturing_year=2020)
        order = ServiceOrder.objects.create(**self.data, vehicle=truck)
        truck.soft_delete()
        order.refresh_from_db()
        self.assertEqual(order.vehicle_id, truck.pk)
        self.assertEqual(self.client.get("/api/orders/?vehicle=abc").status_code, 400)
