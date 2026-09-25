import re
from rest_framework import serializers
from .models import Truck
from .services import FipeClient  # Kept as the isolated valuation adapter; CRUD does not call it.

class TruckSerializer(serializers.ModelSerializer):
    valuation_current = serializers.SerializerMethodField()

    class Meta:
        model = Truck
        fields = ['id', 'license_plate', 'brand', 'model', 'manufacturing_year', 'fipe_price', 'fipe_metadata', 'valuation_current', 'created_at', 'updated_at']
        read_only_fields = ['id', 'fipe_price', 'fipe_metadata', 'valuation_current', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        if isinstance(data, dict) and 'license_plate' in data:
            data = data.copy()
            if not isinstance(data['license_plate'], str):
                raise serializers.ValidationError({'license_plate': 'Plate must be text'})
            data['license_plate'] = data['license_plate'].upper().replace('-', '').replace(' ', '')
        return super().to_internal_value(data)

    def validate_license_plate(self, value):
        if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", value):
            raise serializers.ValidationError("Use a valid old-format or Mercosul plate")
        queryset = Truck.objects.filter(license_plate=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An active truck already uses this plate")
        return value

    def get_valuation_current(self, obj):
        return obj.fipe_metadata.get("identity") == [obj.brand, obj.model, obj.manufacturing_year]

