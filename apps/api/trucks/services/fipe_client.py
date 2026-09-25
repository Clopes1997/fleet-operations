import re
from decimal import Decimal, InvalidOperation
import requests

class FipeUnavailable(Exception):
    pass

class FipeClient:
    BASE_URL = "https://fipe.parallelum.com.br/api/v2"

    @classmethod
    def _make_request(cls, endpoint):
        try:
            response = requests.get(f"{cls.BASE_URL}/{endpoint}", timeout=10)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise FipeUnavailable("FIPE is unavailable or returned malformed data") from exc

    @staticmethod
    def _code(code):
        code = str(code)
        if not re.fullmatch(r"[0-9-]{1,30}", code):
            raise ValueError("Invalid FIPE code")
        return code

    @classmethod
    def get_brands(cls, vehicle_type="trucks"):
        result = cls._make_request("trucks/brands")
        if not isinstance(result, list):
            raise FipeUnavailable("Malformed brand list")
        return result

    @classmethod
    def get_models(cls, vehicle_type, brand_code):
        result = cls._make_request(f"trucks/brands/{cls._code(brand_code)}/models")
        if isinstance(result, dict):
            result = result.get("modelos")
        if not isinstance(result, list):
            raise FipeUnavailable("Malformed model list")
        return result

    @classmethod
    def get_years(cls, vehicle_type, brand_code, model_code):
        result = cls._make_request(f"trucks/brands/{cls._code(brand_code)}/models/{cls._code(model_code)}/years")
        if not isinstance(result, list):
            raise FipeUnavailable("Malformed year list")
        return result

    @classmethod
    def quote(cls, brand_code, model_code, year_code):
        result = cls._make_request(f"trucks/brands/{cls._code(brand_code)}/models/{cls._code(model_code)}/years/{cls._code(year_code)}")
        if not isinstance(result, dict):
            raise FipeUnavailable("Malformed quotation")
        text = result.get("price") or result.get("valor")
        if not isinstance(text, str) or not re.fullmatch(r"(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2}|(R\$\s*)?\d+,\d{2}", text.strip()):
            raise FipeUnavailable("Invalid FIPE price")
        try:
            price = Decimal(text.replace("R$", "").replace(".", "").replace(",", ".").strip())
            if not price.is_finite() or price < 0 or price > Decimal("9999999999.99"):
                raise InvalidOperation
        except InvalidOperation as exc:
            raise FipeUnavailable("Invalid FIPE amount") from exc
        return price, result

    @classmethod
    def get_price(cls, vehicle_type, brand_code, model_code, year_code):
        return cls.quote(brand_code, model_code, year_code)[0]

    @staticmethod
    def _exact(rows, name):
        matches = [row.get("code", row.get("codigo")) for row in rows if isinstance(row, dict) and str(row.get("name", row.get("nome", ""))).strip().casefold() == name.strip().casefold()]
        return str(matches[0]) if len(matches) == 1 and matches[0] is not None else None

    @classmethod
    def validate_brand(cls, name):
        return cls._exact(cls.get_brands(), name)

    @classmethod
    def validate_model(cls, brand_code, name):
        return cls._exact(cls.get_models("trucks", brand_code), name)

    @classmethod
    def validate_year(cls, brand_code, model_code, year):
        rows = cls.get_years("trucks", brand_code, model_code)
        matches = [row.get("code", row.get("codigo")) for row in rows if isinstance(row, dict) and str(row.get("name", row.get("nome", ""))).split()[0:1] == [str(year)]]
        return str(matches[0]) if len(matches) == 1 else None

    @classmethod
    def get_truck_price(cls, brand, model, year):
        brand_code = cls.validate_brand(brand)
        if not brand_code:
            return None
        model_code = cls.validate_model(brand_code, model)
        if not model_code:
            return None
        year_code = cls.validate_year(brand_code, model_code, year)
        return cls.get_price("trucks", brand_code, model_code, year_code) if year_code else None

