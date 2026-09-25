from django.core.management.base import BaseCommand
from trucks.models import Truck
from trucks.services import FipeClient
from decimal import Decimal


class Command(BaseCommand):
    help = 'Popula o banco de dados com caminhões de exemplo'

    def handle(self, *args, **options):
        self.stdout.write('Criando caminhões de exemplo...')

        trucks_data = [
            {
                'license_plate': 'ABC1234',
                'brand': 'Scania',
                'model': 'G-340',
                'manufacturing_year': 2020
            },
            {
                'license_plate': 'DEF5678',
                'brand': 'Volvo',
                'model': 'FH',
                'manufacturing_year': 2020
            },
            {
                'license_plate': 'GHI9012',
                'brand': 'Mercedes-Benz',
                'model': 'Actros',
                'manufacturing_year': 2019
            },
            {
                'license_plate': 'JKL3456',
                'brand': 'Iveco',
                'model': 'Tector',
                'manufacturing_year': 2018
            },
            {
                'license_plate': 'MNO7890',
                'brand': 'Ford',
                'model': 'Cargo',
                'manufacturing_year': 2019
            }
        ]

        created_count = 0
        skipped_count = 0

        for truck_data in trucks_data:
            license_plate = truck_data['license_plate']
            
            if Truck.objects.filter(license_plate=license_plate).exists():
                self.stdout.write(
                    self.style.WARNING(f'Caminhão com placa {license_plate} já existe. Pulando...')
                )
                skipped_count += 1
                continue

            try:
                fipe_price = FipeClient.get_truck_price(
                    truck_data['brand'],
                    truck_data['model'],
                    truck_data['manufacturing_year']
                )

                if fipe_price is None:
                    self.stdout.write(
                        self.style.ERROR(
                            f'ERRO: Não foi possível obter preço FIPE para {truck_data["brand"]} '
                            f'{truck_data["model"]} {truck_data["manufacturing_year"]}. '
                            f'Verifique se os dados estão corretos na API FIPE.'
                        )
                    )
                    continue

                Truck.objects.create(
                    license_plate=license_plate,
                    brand=truck_data['brand'],
                    model=truck_data['model'],
                    manufacturing_year=truck_data['manufacturing_year'],
                    fipe_price=fipe_price
                )

                self.stdout.write(
                    self.style.SUCCESS(
                        f'Criado: {truck_data["brand"]} {truck_data["model"]} - '
                        f'{license_plate} (R$ {fipe_price:,.2f})'
                    )
                )
                created_count += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Erro ao criar caminhão {license_plate}: {str(e)}')
                )

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'Seed concluído! {created_count} caminhões criados, {skipped_count} pulados.'
            )
        )
