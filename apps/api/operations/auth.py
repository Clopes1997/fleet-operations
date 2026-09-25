import json
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST

@require_GET
def session(request):
    token = get_token(request)
    user = request.user
    return JsonResponse({"authenticated": user.is_authenticated,
                         "username": user.get_username() if user.is_authenticated else None,
                         "csrfToken": token})

@require_POST
@csrf_protect
def sign_in(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid JSON"}, status=400)
    if not isinstance(data, dict) or not isinstance(data.get("username"), str) or not isinstance(data.get("password"), str):
        return JsonResponse({"detail": "Username and password are required"}, status=400)
    user = authenticate(request, username=data["username"], password=data["password"])
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)
    login(request, user)
    return JsonResponse({"authenticated": True, "username": user.get_username(), "csrfToken": get_token(request)})

@require_POST
@csrf_protect
def sign_out(request):
    logout(request)
    return JsonResponse({"authenticated": False, "csrfToken": get_token(request)})
