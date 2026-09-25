from unittest.mock import patch
import requests
from django.test import SimpleTestCase
from trucks.services.fipe_client import FipeClient, FipeUnavailable

class FipeControlledAcceptance(SimpleTestCase):
    @patch("trucks.services.fipe_client.requests.get",side_effect=requests.Timeout)
    def test_unavailable(self,request):
        with self.assertRaises(FipeUnavailable): FipeClient.get_brands()
    @patch.object(FipeClient,"_make_request",return_value={"price":"R$ 123,45","codeFipe":"synthetic","referenceMonth":"fixture"})
    def test_exact_decimal_and_metadata(self,request):
        price,raw=FipeClient.quote("1","1","2020-1")
        self.assertEqual(str(price),"123.45")
        self.assertEqual(raw["codeFipe"],"synthetic")
        self.assertEqual(raw["referenceMonth"],"fixture")
    @patch.object(FipeClient,"get_years",return_value=[{"code":"2020-1","name":"2020 Diesel"},{"code":"2020-2","name":"2020 Other"}])
    def test_ambiguous_year_is_not_guessed(self,request):
        self.assertIsNone(FipeClient.validate_year("1","1",2020))
    @patch.object(FipeClient,"_make_request",return_value={"price":"unexpected"})
    def test_malformed_quote(self,request):
        with self.assertRaises(FipeUnavailable): FipeClient.quote("1","1","2020-1")

