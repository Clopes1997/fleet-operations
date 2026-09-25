"""Controlled read-only catalog probe; never applies a valuation to a vehicle."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"apps/api"))
from trucks.services.fipe_client import FipeClient, FipeUnavailable
parser=argparse.ArgumentParser()
parser.add_argument("--live",action="store_true",required=True)
parser.add_argument("--out",required=True)
args=parser.parse_args()
result={"kind":"catalog-probe","timestamp":datetime.now(timezone.utc).isoformat(),"status":"NOT_RUN",
        "warning":"Service-provided codes probe the catalog only; no identity match or vehicle update is performed."}
try:
    def first_code(rows):
        codes=sorted(str(r.get("code",r.get("codigo"))) for r in rows if isinstance(r,dict) and r.get("code",r.get("codigo")) is not None)
        if not codes: raise FipeUnavailable("Empty catalog")
        return codes[0]
    brand=first_code(FipeClient.get_brands())
    model=first_code(FipeClient.get_models("trucks",brand))
    year=first_code(FipeClient.get_years("trucks",brand,model))
    price,metadata=FipeClient.quote(brand,model,year)
    result.update(status="PASS",codes=[brand,model,year],price=str(price),metadata=metadata)
except (FipeUnavailable,ValueError,TypeError):
    result.update(status="REQUIRES_REVIEW",reason="Live FIPE unavailable, malformed, or empty; ordinary vehicle CRUD remains independent")
with Path(args.out).open("x",encoding="utf8") as handle: json.dump(result,handle,indent=2)
print(result["status"])
sys.exit(0 if result["status"]=="PASS" else 2)

