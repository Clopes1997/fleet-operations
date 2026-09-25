from django.test import TestCase
from django.core.exceptions import ValidationError
from trucks.models import Truck


class TruckModelTest(TestCase):
    def test_create_truck(self):
        truck = Truck.objects.create(
            license_plate="ABC1234",
            brand="Scania",
            model="FH 540",
            manufacturing_year=2020,
            fipe_price=500000.00
        )
        self.assertEqual(truck.license_plate, "ABC1234")
        self.assertEqual(truck.brand, "Scania")
        self.assertEqual(truck.model, "FH 540")
        self.assertEqual(truck.manufacturing_year, 2020)

    def test_unique_license_plate(self):
        Truck.objects.create(
            license_plate="ABC1234",
            brand="Scania",
            model="FH 540",
            manufacturing_year=2020,
            fipe_price=500000.00
        )
        with self.assertRaises(ValidationError):
            truck = Truck(
                license_plate="ABC1234",
                brand="Volvo",
                model="FH 460",
                manufacturing_year=2021,
                fipe_price=450000.00
            )
            truck.full_clean()
            truck.save()

