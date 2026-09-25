import hashlib
import json
from decimal import Decimal, InvalidOperation
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from trucks.models import Truck
from .models import ServiceOrder, ImportRecord

def decimal_value(raw):
    if not isinstance(raw, str):
        raise ValueError("Amounts must be decimal strings, not floating-point JSON numbers")
    try:
        value = Decimal(raw)
        if not value.is_finite() or value < 0 or value.as_tuple().exponent < -2:
            raise ValueError("Nonnegative amounts with at most two decimal places required")
        return value
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal amount") from exc

def timestamp(raw):
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("Use an ISO timestamp with timezone")
    value = parse_datetime(raw)
    if value is None or timezone.is_naive(value):
        raise ValueError("Source timestamps require an explicit timezone")
    return value

def inspect_bundle(bundle):
    if not isinstance(bundle, dict) or bundle.get("version") != 1:
        raise ValueError("Expected version 1 import bundle")
    source, installation, rows = bundle.get("source"), bundle.get("installation"), bundle.get("rows")
    if source not in ("service-orders", "trucks-system") or not isinstance(installation, str) or not 1 <= len(installation) <= 64:
        raise ValueError("Invalid source or installation")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
        raise ValueError("Provide 1–2000 rows per reviewed bundle")
    prepared, errors, seen, plates = [], [], set(), set()
    for index, row in enumerate(rows):
        try:
            if not isinstance(row, dict):
                raise ValueError("Each row must be an object")
            legacy_id = row.get("id")
            if isinstance(legacy_id, bool) or not isinstance(legacy_id, (str, int)) or not 1 <= len(str(legacy_id)) <= 64:
                raise ValueError("Missing legacy ID")
            identity = str(legacy_id)
            if identity in seen:
                raise ValueError("Duplicate source ID in bundle")
            seen.add(identity)
            fingerprint = hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
            entity = "order" if source == "service-orders" else "truck"
            lookup = dict(source=source, installation=installation, entity=entity, legacy_id=identity)
            existing = ImportRecord.objects.filter(**lookup).first()
            if existing:
                if existing.fingerprint != fingerprint:
                    raise ValueError("Previously imported identity changed; reconcile explicitly")
                prepared.append((None, lookup, fingerprint, row))
                continue
            if source == "service-orders":
                deadline = parse_date(row.get("prazo", ""))
                if deadline is None:
                    raise ValueError("Invalid calendar deadline")
                obj = ServiceOrder(customer_snapshot=row.get("cliente"), description=row.get("descricao"),
                    quoted_value=decimal_value(row.get("valor")), deadline=deadline, status=row.get("status"),
                    deleted_at=timestamp(row.get("deleted_at")))
            else:
                obj = Truck(license_plate=row.get("license_plate"), brand=row.get("brand"), model=row.get("model"),
                    manufacturing_year=row.get("manufacturing_year"), fipe_price=decimal_value(row["fipe_price"]) if row.get("fipe_price") is not None else None,
                    fipe_metadata={"legacy": True}, deleted_at=timestamp(row.get("deleted_at")))
                if not isinstance(obj.license_plate, str):
                    raise ValueError("Plate must be text")
                obj.license_plate = obj.license_plate.upper().replace("-", "").replace(" ", "")
                import re
                if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", obj.license_plate):
                    raise ValueError("Invalid plate")
                obj.active_plate = obj.license_plate if obj.deleted_at is None else None
                if obj.active_plate:
                    if obj.active_plate in plates:
                        raise ValueError("Duplicate active plate in bundle")
                    plates.add(obj.active_plate)
            for name in ("created_at", "updated_at"):
                if row.get(name):
                    timestamp(row[name])
            obj.full_clean()
            prepared.append((obj, lookup, fingerprint, row))
        except (ValueError, TypeError, ValidationError) as exc:
            errors.append({"row": index + 1, "error": str(exc)})
    return prepared, errors

@api_view(["POST"])
@permission_classes([IsAdminUser])
def preview(request):
    try:
        prepared, errors = inspect_bundle(request.data)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response({"new": sum(obj is not None for obj, *_ in prepared),
                     "skipped": sum(obj is None for obj, *_ in prepared), "errors": errors})

@api_view(["POST"])
@permission_classes([IsAdminUser])
@transaction.atomic
def apply(request):
    try:
        prepared, errors = inspect_bundle(request.data)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    if errors:
        return Response({"errors": errors}, status=400)
    count = 0
    for obj, lookup, fingerprint, row in prepared:
        if obj is None:
            continue
        obj.save()
        preserved = {name: timestamp(row[name]) for name in ("created_at", "updated_at") if row.get(name)}
        if preserved:
            type(obj)._base_manager.filter(pk=obj.pk).update(**preserved)
        ImportRecord.objects.create(**lookup, target_id=obj.pk, fingerprint=fingerprint, payload=row)
        count += 1
    return Response({"imported": count, "skipped": len(prepared) - count})
