from rest_framework import serializers
from .models import Customer, ServiceOrder, OrderTransition

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "display_name", "notes", "deleted_at"]
        read_only_fields = ["id", "deleted_at"]

class TransitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderTransition
        fields = ["id", "previous_status", "next_status", "actor", "occurred_at"]

class ServiceOrderSerializer(serializers.ModelSerializer):
    transitions = TransitionSerializer(many=True, read_only=True)
    class Meta:
        model = ServiceOrder
        fields = ["id", "customer", "vehicle", "customer_snapshot", "description", "quoted_value", "deadline", "status", "version", "created_at", "updated_at", "transitions"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        if self.instance:
            if attrs.get("version") != self.instance.version:
                raise serializers.ValidationError({"version": "Stale or missing version; reload this order"})
            old, new = self.instance.status, attrs.get("status", self.instance.status)
            allowed = {"pendente": {"pendente", "em_andamento", "cancelado"},
                       "em_andamento": {"em_andamento", "concluido", "cancelado"},
                       "concluido": {"concluido"}, "cancelado": {"cancelado"}}
            if new not in allowed[old]:
                raise serializers.ValidationError({"status": "Invalid lifecycle transition"})
        elif attrs.get("status", "pendente") != "pendente":
            raise serializers.ValidationError({"status": "New orders start pending"})
        for name in ("customer", "vehicle"):
            obj = attrs.get(name)
            if obj and obj.deleted_at:
                raise serializers.ValidationError({name: "Cannot link an archived record"})
        if not self.instance:
            attrs["version"] = 0
        return attrs
