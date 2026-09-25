from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler

def handle_exception(exc, context):
    if isinstance(exc, IntegrityError):
        return Response({"detail": "Conflicting record; reload and review uniqueness."}, status=409)
    if isinstance(exc, DjangoValidationError):
        return Response(getattr(exc, "message_dict", {"detail": exc.messages}), status=400)
    return exception_handler(exc, context)
