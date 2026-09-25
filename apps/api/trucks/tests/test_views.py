from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from trucks.models import Truck
from unittest.mock import patch
from decimal import Decimal
from django.contrib.auth.models import User


class TruckViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser("test", password="test-only-password"))
        self.url = reverse('truck-list')

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_create_truck(self, mock_fipe):
        mock_fipe.return_value = Decimal('500000.00')
        data = {
            "license_plate": "ABC1234",
            "brand": "Scania",
            "model": "FH 540",
            "manufacturing_year": 2020
        }
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Truck.objects.count(), 1)
        self.assertEqual(Truck.objects.get().license_plate, "ABC1234")

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_create_duplicate_license_plate(self, mock_fipe):
        mock_fipe.return_value = Decimal('500000.00')
        data = {
            "license_plate": "ABC1234",
            "brand": "Scania",
            "model": "FH 540",
            "manufacturing_year": 2020
        }
        self.client.post(self.url, data, format='json')
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_list_trucks(self, mock_fipe):
        mock_fipe.return_value = Decimal('500000.00')
        Truck.objects.create(
            license_plate="ABC1234",
            brand="Scania",
            model="FH 540",
            manufacturing_year=2020,
            fipe_price=Decimal('500000.00')
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_update_truck(self, mock_fipe):
        mock_fipe.return_value = Decimal('450000.00')
        truck = Truck.objects.create(
            license_plate="ABC1234",
            brand="Scania",
            model="FH 540",
            manufacturing_year=2020,
            fipe_price=Decimal('500000.00')
        )
        url = reverse('truck-detail', kwargs={'pk': truck.pk})
        data = {
            "license_plate": "ABC1234",
            "brand": "Volvo",
            "model": "FH 460",
            "manufacturing_year": 2021
        }
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        truck.refresh_from_db()
        self.assertEqual(truck.brand, "Volvo")
        self.assertEqual(truck.fipe_price, Decimal('500000.00'))  # Preserved legacy valuation; no automatic network refresh.

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_partial_update_truck(self, mock_fipe):
        mock_fipe.return_value = Decimal('450000.00')
        truck = Truck.objects.create(
            license_plate="ABC1234",
            brand="Scania",
            model="FH 540",
            manufacturing_year=2020,
            fipe_price=Decimal('500000.00')
        )
        url = reverse('truck-detail', kwargs={'pk': truck.pk})
        data = {
            "brand": "Volvo",
            "model": "FH 460",
            "manufacturing_year": 2021
        }
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        truck.refresh_from_db()
        self.assertEqual(truck.brand, "Volvo")
