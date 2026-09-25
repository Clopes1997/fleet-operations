from django.test import TestCase
from trucks.serializers import TruckSerializer
from unittest.mock import patch
from decimal import Decimal


class TruckSerializerTest(TestCase):
    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_validate_license_plate(self, mock_fipe):
        mock_fipe.return_value = Decimal('500000.00')
        data = {
            "license_plate": "abc-1234",
            "brand": "Scania",
            "model": "FH 540",
            "manufacturing_year": 2020
        }
        serializer = TruckSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['license_plate'], "ABC1234")

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_validate_fipe_integration(self, mock_fipe):
        mock_fipe.return_value = Decimal('500000.00')
        data = {
            "license_plate": "ABC1234",
            "brand": "Scania",
            "model": "FH 540",
            "manufacturing_year": 2020
        }
        serializer = TruckSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertNotIn('fipe_price', serializer.validated_data)
        mock_fipe.assert_not_called()

    @patch('trucks.serializers.FipeClient.get_truck_price')
    def test_validate_fipe_failure(self, mock_fipe):
        mock_fipe.return_value = None
        data = {
            "license_plate": "ABC1234",
            "brand": "Inexistente",
            "model": "Modelo Inexistente",
            "manufacturing_year": 2020
        }
        serializer = TruckSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        mock_fipe.assert_not_called()

