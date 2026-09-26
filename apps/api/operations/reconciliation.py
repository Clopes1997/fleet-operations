"""Deterministic, explicit migration into an isolated consolidated target only."""
import hashlib
import json
import re
from decimal import Decimal
from datetime import datetime, timezone as datetime_timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.dateparse import parse_date
from .imports import decimal_value, timestamp
from .models import Customer, ServiceOrder, OrderTransition, ImportRecord
from trucks.models import Truck

MODELS = {"customer": Customer, "vehicle": Truck, "order": ServiceOrder, "history": OrderTransition}
FIELDS = {
    "customer": ("display_name", "notes", "deleted_at"),
    "vehicle": ("license_plate", "brand", "model", "manufacturing_year", "fipe_price", "fipe_metadata", "deleted_at", "created_at", "updated_at"),
    "order": ("customer_snapshot", "description", "quoted_value", "deadline", "status", "customer_id", "vehicle_id", "deleted_at", "created_at", "updated_at"),
    "history": ("order_id", "previous_status", "next_status", "occurred_at"),
}
REFS = {"order": {"customer": "customer", "vehicle": "vehicle"}, "history": {"order": "order"}}
STATUSES = {value for value, _ in ServiceOrder.STATUS}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

def query(kind):
    return MODELS[kind]._base_manager

def safe_value(value):
    if isinstance(value, datetime):
        return value.astimezone(datetime_timezone.utc).isoformat()
    if value is None or isinstance(value, (str, int, bool, dict, list)):
        return value
    if isinstance(value, Decimal):
        return format(value, ".2f")
    return value.isoformat()

def observe(kind, obj):
    return {field: safe_value(getattr(obj, field)) for field in FIELDS[kind]}

def identity(bundle, row):
    return dict(source=bundle["source"], installation=bundle["installation"], entity="reviewed-" + row["type"], legacy_id=row["id"])

def normalize(bundle):
    if not isinstance(bundle, dict) or bundle.get("version") not in (1, 2):
        raise ValueError("Expected bundle version 1 or 2")
    if bundle.get("source") not in ("service-orders", "trucks-system", "fleet-operations"):
        raise ValueError("Unsupported source")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(bundle.get("installation", ""))):
        raise ValueError("Explicit installation identity required")
    rows = bundle.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
        raise ValueError("Provide 1–2000 records")
    result = []
    for original in rows:
        if not isinstance(original, dict):
            raise ValueError("Source row must be an object")
        row = dict(original)
        if bundle["version"] == 1:
            if bundle["source"] == "service-orders":
                row = {"id": row.get("id"), "type": "order", "customer_snapshot": row.get("cliente"),
                       "description": row.get("descricao"), "quoted_value": row.get("valor"),
                       "deadline": row.get("prazo"), "status": row.get("status"),
                       **{key: row[key] for key in ("created_at", "updated_at", "deleted_at") if key in row}}
            elif bundle["source"] == "trucks-system":
                row["type"] = "vehicle"
            else:
                raise ValueError("Fleet bundle requires version 2")
        if isinstance(row.get("id"), bool) or not isinstance(row.get("id"), (str, int)) or not 1 <= len(str(row["id"])) <= 64:
            raise ValueError("Invalid source ID")
        row["id"] = str(row["id"])
        row["_raw"] = original
        result.append(row)
    return {**bundle, "rows": result}

def validate_row(row):
    kind = row.get("type")
    if kind not in MODELS:
        raise ValueError("Unknown entity type")
    data = {key: value for key, value in row.items() if key in FIELDS[kind] and not key.endswith("_id")}
    for key in ("deleted_at", "created_at", "updated_at", "occurred_at"):
        if key in data:
            data[key] = timestamp(data[key])
    if kind == "customer":
        data.setdefault("notes", "")
    if kind == "vehicle":
        plate = row.get("license_plate")
        if not isinstance(plate, str):
            raise ValueError("Invalid plate")
        data["license_plate"] = plate.upper().replace("-", "").replace(" ", "")
        if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", data["license_plate"]):
            raise ValueError("Invalid plate")
        data["fipe_price"] = decimal_value(row["fipe_price"]) if row.get("fipe_price") is not None else None
        data.setdefault("fipe_metadata", {"legacy": True})
        if not isinstance(data["fipe_metadata"], dict):
            raise ValueError("FIPE metadata must be an object")
        if row.get("customer") is not None:
            raise ValueError("Vehicle ownership is not represented; preserve and review separately")
    if kind == "order":
        data["quoted_value"] = decimal_value(row.get("quoted_value"))
        data["deadline"] = parse_date(row.get("deadline", ""))
        if data["deadline"] is None or data.get("status") not in STATUSES:
            raise ValueError("Invalid deadline/status")
    if kind == "history":
        if not data.get("occurred_at") or data.get("previous_status") not in STATUSES or data.get("next_status") not in STATUSES:
            raise ValueError("Historical transitions require explicit timestamp and statuses")
        if row.get("actor") is not None:
            raise ValueError("Historical actor identity requires separate explicit mapping")
    allowed = set(FIELDS[kind]) | set(REFS.get(kind, {})) | {"type", "id", "_raw"}
    if set(row) - allowed:
        raise ValueError("Unsupported fields remain in source; explicit mapping needed")
    # Validate fields without resolving FKs or database uniqueness yet.
    obj = MODELS[kind](**data)
    excluded = ["id"] + [key for key in FIELDS[kind] if key.endswith("_id")] + ["active_plate", "order", "customer", "vehicle", "actor"]
    obj.clean_fields(exclude=excluded)
    return data

def candidates(kind, data):
    if kind == "customer":
        return query(kind).filter(display_name__iexact=data["display_name"])
    if kind == "vehicle":
        return query(kind).filter(license_plate=data["license_plate"])
    if kind == "order":
        return query(kind).filter(customer_snapshot=data["customer_snapshot"], description=data["description"], deadline=data["deadline"])
    return query(kind).none()

def preflight(raw, decisions=None):
    bundle = normalize(raw)
    decisions = decisions or {"sourceSha256": digest(raw), "decisions": {}}
    if decisions.get("sourceSha256") != digest(raw) or not isinstance(decisions.get("decisions"), dict):
        raise ValueError("Review file fingerprint does not match source")
    indexed, duplicates = {}, set()
    for row in bundle["rows"]:
        key = str(row.get("type")) + ":" + row["id"]
        if key in indexed:
            duplicates.add(key)
        indexed[key] = row
    if set(decisions["decisions"]) - set(indexed):
        raise ValueError("Review file contains unknown source identities")
    records, prepared = [], {}
    for row in bundle["rows"]:
        kind, key = row.get("type"), str(row.get("type")) + ":" + row["id"]
        item = {"key": key, "classification": "invalid_source_record", "status": "FAIL", "issues": [], "candidates": []}
        records.append(item)
        try:
            if key in duplicates:
                raise ValueError("Duplicate source ID")
            data = validate_row(row)
            for field, ref_kind in REFS.get(kind, {}).items():
                ref = row.get(field)
                if ref is None:
                    if kind == "history":
                        raise ValueError("Missing history order")
                    item["issues"].append("No " + field + " relationship in source; no relationship invented")
                    continue
                target = indexed.get(ref_kind + ":" + str(ref))
                if target is None:
                    raise ValueError("Missing " + field + " reference")
                if not row.get("deleted_at") and target.get("deleted_at"):
                    raise ValueError("Active reference to archived " + field)
                decision = decisions["decisions"].get(ref_kind + ":" + str(ref), {})
                if decision.get("action") in ("skip", "defer"):
                    raise ValueError("Reference is skipped/deferred")
            prior = ImportRecord.objects.filter(**identity(bundle, row)).first()
            choice = decisions["decisions"].get(key, {})
            action = choice.get("action", "new")
            if action not in ("new", "map", "skip", "defer"):
                raise ValueError("Invalid decision action")
            if prior:
                if prior.fingerprint != digest(row["_raw"]):
                    item.update(classification="conflict", status="REQUIRES_REVIEW")
                    item["issues"].append("Previously imported source changed")
                    continue
                if prior.payload.get("decision") != choice:
                    item.update(classification="conflict", status="REQUIRES_REVIEW")
                    item["issues"].append("Recorded decision changed")
                    continue
                if prior.target_id and not query(kind).filter(pk=prior.target_id).exists():
                    raise ValueError("Mapped target is missing")
                if prior.target_id and digest(observe(kind, query(kind).get(pk=prior.target_id))) != prior.payload.get("observedSha256"):
                    item.update(classification="conflict", status="REQUIRES_REVIEW")
                    item["issues"].append("Mapped target changed since import")
                    continue
                item.update(classification="exact_match", status="PASS")
                prepared[key] = (row, data, choice, prior)
                continue
            matches = list(candidates(kind, data))
            item["candidates"] = [{"targetId": obj.pk, "targetSha256": digest(observe(kind, obj)), "archived": bool(getattr(obj, "deleted_at", None))} for obj in matches]
            duplicate_fields = {"customer": ("display_name",), "vehicle": ("license_plate",), "order": ("customer_snapshot", "description", "deadline")}.get(kind, ())
            source_matches = [other for other in bundle["rows"] if duplicate_fields and other.get("type") == kind and other["id"] != row["id"]
                              and all(str(other.get(field, "")).strip().casefold().replace("-", "") == str(row.get(field, "")).strip().casefold().replace("-", "") for field in duplicate_fields)]
            item["candidates"].extend({"sourceKey": kind + ":" + other["id"]} for other in source_matches)
            if action in ("skip", "defer"):
                item.update(classification="conflict", status="REQUIRES_REVIEW")
                item["issues"].append("Explicit " + action + "; raw evidence preserved, not migrated")
                if action == "skip" and choice.get("reason"):
                    item["status"] = "PASS"
                    prepared[key] = (row, data, choice, None)
                continue
            if action == "map":
                obj = query(kind).filter(pk=choice.get("targetId")).first()
                if not obj or choice.get("targetSha256") != digest(observe(kind, obj)):
                    raise ValueError("Missing or changed reviewed target")
                for field, value in data.items():
                    if safe_value(getattr(obj, field)) != safe_value(value):
                        raise ValueError("Mapped target differs; reconcile values before mapping")
            elif (matches or source_matches) and choice.get("action") != "new":
                item.update(classification="possible_duplicate", status="REQUIRES_REVIEW")
                item["issues"].append("Explicit map/new/skip/defer decision required")
                continue
            if kind == "vehicle" and not data.get("deleted_at"):
                collisions = [other for other in bundle["rows"] if other.get("type") == "vehicle" and other["id"] != row["id"]
                              and str(other.get("license_plate", "")).upper().replace("-", "").replace(" ", "") == data["license_plate"]
                              and not other.get("deleted_at") and decisions["decisions"].get("vehicle:" + other["id"], {}).get("action") != "skip"]
                active = Truck.objects.filter(active_plate=data["license_plate"])
                if action == "map":
                    active = active.exclude(pk=choice["targetId"])
                if collisions or active.exists():
                    item.update(classification="conflict", status="REQUIRES_REVIEW")
                    item["issues"].append("Active plate collision; source IDs: " + ",".join(other["id"] for other in collisions))
                    continue
            item.update(classification="new_record" if action == "new" else "exact_match", status="PASS")
            prepared[key] = (row, data, choice, None)
        except (ValueError, TypeError, ValidationError, KeyError) as exc:
            # Codes/messages here contain field names and source IDs, not raw source values.
            detail = str(exc) if isinstance(exc, ValueError) else ",".join(getattr(exc, "message_dict", {}).keys())
            item["issues"].append(type(exc).__name__ + ": " + detail)
    # Existing status history is evidence, never synthesized. Require an ordered, coherent
    # chain ending at the source order's current status; gaps need owner reconciliation.
    for order in (r for r in bundle["rows"] if r.get("type") == "order"):
        history = [r for r in bundle["rows"] if r.get("type") == "history" and str(r.get("order")) == order["id"]]
        if not history:
            continue
        try:
            history.sort(key=lambda r: timestamp(r.get("occurred_at")))
            times = [timestamp(r.get("occurred_at")) for r in history]
            allowed = {"pendente": {"em_andamento", "cancelado"}, "em_andamento": {"concluido", "cancelado"}, "concluido": set(), "cancelado": set()}
            coherent = len(set(times)) == len(times) and history[-1].get("next_status") == order.get("status")
            coherent = coherent and all(r.get("next_status") in allowed.get(r.get("previous_status"), set()) for r in history)
            coherent = coherent and all(a.get("next_status") == b.get("previous_status") for a, b in zip(history, history[1:]))
        except (ValueError, TypeError):
            coherent = False
        if not coherent:
            for item in records:
                if item["key"] in {"history:" + r["id"] for r in history} and item["status"] == "PASS":
                    item.update(classification="conflict", status="REQUIRES_REVIEW")
                    item["issues"].append("Ambiguous timestamps, invalid transition or incomplete status chain; no missing events invented")
    status = "FAIL" if any(r["status"] == "FAIL" for r in records) else "REQUIRES_REVIEW" if any(r["status"] != "PASS" for r in records) else "PASS"
    return bundle, prepared, {"status": status, "sourceSha256": digest(raw), "records": records,
                             "reviewTemplate": {"sourceSha256": digest(raw), "decisions": {r["key"]: {"action": "defer"} for r in records if r["status"] != "PASS"}}}

@transaction.atomic
def apply_reviewed(raw, decisions=None):
    bundle, prepared, result = preflight(raw, decisions)
    if result["status"] != "PASS":
        raise ValueError("Resolve every invalid/conflicting/deferred record before import")
    imported = 0
    for kind in MODELS:
        for key, (row, data, choice, prior) in prepared.items():
            if row["type"] != kind or prior:
                continue
            if choice.get("action") == "skip":
                target_id, observed = 0, None
            else:
                values = dict(data)
                for field, ref_kind in REFS.get(kind, {}).items():
                    if row.get(field) is not None:
                        mapping = ImportRecord.objects.get(source=bundle["source"], installation=bundle["installation"],
                            entity="reviewed-" + ref_kind, legacy_id=str(row[field]))
                        if not mapping.target_id:
                            raise ValueError("Skipped reference cannot be migrated")
                        values[field + "_id"] = mapping.target_id
                if choice.get("action") == "map":
                    obj = query(kind).select_for_update().get(pk=choice["targetId"])
                    if digest(observe(kind, obj)) != choice["targetSha256"]:
                        raise ValueError("Reviewed target changed")
                    if any(safe_value(getattr(obj, field)) != safe_value(value) for field, value in values.items()):
                        raise ValueError("Reviewed target relationships differ")
                else:
                    obj = MODELS[kind](**values)
                    obj.full_clean(exclude=["active_plate", "actor"], validate_constraints=False)
                    obj.save()
                    preserved = {k: v for k, v in values.items() if k in ("created_at", "updated_at", "occurred_at")}
                    if preserved:
                        query(kind).filter(pk=obj.pk).update(**preserved)
                        obj.refresh_from_db()
                target_id, observed = obj.pk, digest(observe(kind, obj))
            ImportRecord.objects.create(**identity(bundle, row), target_id=target_id, fingerprint=digest(row["_raw"]),
                payload={"raw": row["_raw"], "decision": choice, "observedSha256": observed})
            imported += 1
    return {"imported": imported, "repeated": len(prepared) - imported}

def reconcile(raw):
    bundle = normalize(raw)
    counts = {"source": {}, "target": {}}
    totals = {"source": {"quotes": "0.00", "valuations": "0.00"}, "target": {"quotes": "0.00", "valuations": "0.00"}}
    differences, identities, rows, skipped = [], [], [], []
    for row in bundle["rows"]:
        kind, key = row["type"], row["type"] + ":" + row["id"]
        counts["source"][kind] = counts["source"].get(kind, 0) + 1
        expected = validate_row(row)
        if expected.get("deleted_at"):
            counts["source"][kind + "Archived"] = counts["source"].get(kind + "Archived", 0) + 1
        for total, field in (("quotes", "quoted_value"), ("valuations", "fipe_price")):
            if expected.get(field) is not None:
                totals["source"][total] = format(Decimal(totals["source"][total]) + expected[field], ".2f")
        mapping = ImportRecord.objects.filter(**identity(bundle, row)).first()
        if not mapping or mapping.fingerprint != digest(row["_raw"]):
            differences.append({"key": key, "code": "MISSING_OR_CHANGED_MAPPING"})
            continue
        if mapping.target_id == 0:
            skipped.append(key)
            continue
        obj = query(kind).filter(pk=mapping.target_id).first()
        if not obj:
            differences.append({"key": key, "code": "MISSING_TARGET"})
            continue
        for field, ref_kind in REFS.get(kind, {}).items():
            ref = row.get(field)
            parent = ImportRecord.objects.filter(source=bundle["source"], installation=bundle["installation"], entity="reviewed-" + ref_kind, legacy_id=str(ref)).first() if ref is not None else None
            expected[field + "_id"] = parent.target_id if parent else None
        actual = observe(kind, obj)
        for field, value in expected.items():
            if safe_value(value) != actual[field]:
                differences.append({"key": key, "code": "FIELD_MISMATCH", "field": field})
        if digest(actual) != mapping.payload.get("observedSha256"):
            differences.append({"key": key, "code": "TARGET_CHANGED"})
        counts["target"][kind] = counts["target"].get(kind, 0) + 1
        if actual.get("deleted_at"):
            counts["target"][kind + "Archived"] = counts["target"].get(kind + "Archived", 0) + 1
        for total, field in (("quotes", "quoted_value"), ("valuations", "fipe_price")):
            if field in expected and expected[field] is not None:
                totals["target"][total] = format(Decimal(totals["target"][total]) + Decimal(actual[field]), ".2f")
        identities.append({"key": key, "targetId": obj.pk, "installation": bundle["installation"]})
        rows.append({"key": key, "sha256": digest(actual)})
    return {"status": "FAIL" if differences else "REQUIRES_REVIEW" if skipped else "PASS",
            "counts": counts, "totals": totals, "discrepancies": differences, "identities": identities, "observed": rows, "archivalOnly": skipped}
