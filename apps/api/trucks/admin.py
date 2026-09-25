from django.contrib import admin
from .models import Truck


@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):
    list_display = ['license_plate', 'brand', 'model', 'manufacturing_year', 'fipe_price', 'created_at']
    list_filter = ['brand', 'manufacturing_year']
    search_fields = ['license_plate', 'brand', 'model']
    readonly_fields = ['created_at', 'updated_at']

