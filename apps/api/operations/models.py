from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

class Customer(models.Model):
    display_name = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["display_name", "id"]

class ServiceOrder(models.Model):
    STATUS = [(s, s) for s in ("pendente", "em_andamento", "concluido", "cancelado")]
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT)
    vehicle = models.ForeignKey("trucks.Truck", null=True, blank=True, on_delete=models.PROTECT)
    customer_snapshot = models.CharField(max_length=255)
    description = models.TextField()
    quoted_value = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    deadline = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS, default="pendente")
    version = models.PositiveIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["deadline", "id"]

class OrderTransition(models.Model):
    order = models.ForeignKey(ServiceOrder, on_delete=models.PROTECT, related_name="transitions")
    previous_status = models.CharField(max_length=20)
    next_status = models.CharField(max_length=20)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["occurred_at", "id"]

class ImportRecord(models.Model):
    source = models.CharField(max_length=32)
    installation = models.CharField(max_length=64)
    entity = models.CharField(max_length=32)
    legacy_id = models.CharField(max_length=64)
    target_id = models.PositiveBigIntegerField()
    fingerprint = models.CharField(max_length=64)
    payload = models.JSONField()
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source", "installation", "entity", "legacy_id"], name="fleet_source_identity")]
