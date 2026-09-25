from django.db import transaction
from django.utils import timezone
from rest_framework import filters, status, viewsets
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from .models import Customer, ServiceOrder, OrderTransition
from .serializers import CustomerSerializer, ServiceOrderSerializer

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.filter(deleted_at__isnull=True)
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["display_name"]

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])

class ServiceOrderViewSet(viewsets.ModelViewSet):
    queryset = ServiceOrder.objects.filter(deleted_at__isnull=True).select_related("customer", "vehicle").prefetch_related("transitions")
    serializer_class = ServiceOrderSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["customer_snapshot", "description"]
    ordering_fields = ["deadline", "quoted_value", "created_at", "status"]
    ordering = ["deadline", "id"]

    def get_queryset(self):
        result = super().get_queryset()
        if self.request.query_params.get("status"):
            result = result.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("vehicle"):
            if not self.request.query_params["vehicle"].isdigit():
                raise ValidationError({"vehicle": "Use a numeric vehicle ID"})
            result = result.filter(vehicle_id=self.request.query_params["vehicle"])
        return result

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        # Lock and validate inside one transaction; history and order commit together.
        self.queryset = self.queryset.select_for_update()
        instance = self.get_object()
        old_status = instance.status
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop("partial", False))
        serializer.is_valid(raise_exception=True)
        saved = serializer.save(version=instance.version + 1)
        if old_status != saved.status:
            OrderTransition.objects.create(order=saved, previous_status=old_status, next_status=saved.status, actor=request.user)
        saved._prefetched_objects_cache = {}
        return Response(self.get_serializer(saved).data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        self.queryset = self.queryset.select_for_update()
        instance = self.get_object()
        self.check_object_permissions(request, instance)
        instance.deleted_at = timezone.now()
        instance.version += 1
        instance.save(update_fields=["deleted_at", "version", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
