from unittest.mock import patch, Mock
from django.test import TestCase
from decimal import Decimal
from trucks.services import FipeClient


class FipeClientTest(TestCase):
    @patch('trucks.services.fipe_client.requests.get')
    def test_get_brands(self, mock_get):
        mock_response = Mock()
        mock_response.json.return_value = [
            {"codigo": "1", "nome": "Scania"},
            {"codigo": "2", "nome": "Volvo"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        brands = FipeClient.get_brands()
        self.assertEqual(len(brands), 2)
        self.assertEqual(brands[0]["nome"], "Scania")

    @patch('trucks.services.fipe_client.requests.get')
    def test_get_price(self, mock_get):
        mock_response = Mock()
        mock_response.json.return_value = {
            "valor": "R$ 500.000,00",
            "marca": "Scania",
            "modelo": "FH 540"
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        price = FipeClient.get_price("caminhoes", "1", "1", "2020-1")
        self.assertEqual(price, Decimal("500000.00"))

    @patch('trucks.services.fipe_client.requests.get')
    def test_validate_brand(self, mock_get):
        mock_response = Mock()
        mock_response.json.return_value = [
            {"codigo": "1", "nome": "Scania"},
            {"codigo": "2", "nome": "Volvo"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        brand_code = FipeClient.validate_brand("Scania")
        self.assertEqual(brand_code, "1")

        brand_code = FipeClient.validate_brand("Inexistente")
        self.assertIsNone(brand_code)

    @patch('trucks.services.fipe_client.FipeClient.get_price')
    @patch('trucks.services.fipe_client.FipeClient.validate_year')
    @patch('trucks.services.fipe_client.FipeClient.validate_model')
    @patch('trucks.services.fipe_client.FipeClient.validate_brand')
    def test_get_truck_price(self, mock_brand, mock_model, mock_year, mock_price):
        mock_brand.return_value = "1"
        mock_model.return_value = "1"
        mock_year.return_value = "2020-1"
        mock_price.return_value = Decimal("500000.00")

        price = FipeClient.get_truck_price("Scania", "FH 540", 2020)
        self.assertEqual(price, Decimal("500000.00"))

        mock_brand.return_value = None
        price = FipeClient.get_truck_price("Inexistente", "FH 540", 2020)
        self.assertIsNone(price)

