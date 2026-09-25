from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


class TruckManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Truck(models.Model):
    license_plate = models.CharField(max_length=7, db_index=True)
    brand = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    manufacturing_year = models.IntegerField(
        validators=[
            MinValueValidator(1900),
            MaxValueValidator(2100)
        ]
    )
    fipe_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fipe_metadata = models.JSONField(default=dict, blank=True)
    active_plate = models.CharField(max_length=7, null=True, blank=True, unique=True, editable=False)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TruckManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(deleted_at__isnull=False, active_plate__isnull=True)
                | models.Q(deleted_at__isnull=True, active_plate__isnull=False, active_plate=models.F('license_plate')),
                name='active_plate_matches_vehicle',
            ),
        ]
        indexes = [
            models.Index(fields=['license_plate']),
            models.Index(fields=['deleted_at']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.deleted_at is None:
            queryset = Truck.objects.filter(license_plate=self.license_plate)
            if self.pk:
                queryset = queryset.exclude(pk=self.pk)
            if queryset.exists():
                raise ValidationError({'license_plate': 'Já existe um caminhão ativo com esta placa'})

    def save(self, *args, **kwargs):
        self.active_plate = self.license_plate if self.deleted_at is None else None
        if kwargs.get('update_fields'):
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'active_plate'}
        self.full_clean()
        super().save(*args, **kwargs)

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=['deleted_at'])

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def __str__(self):
        return f"{self.brand} {self.model} - {self.license_plate}"

