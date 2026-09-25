from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import auth
from . import imports
from .views import CustomerViewSet, ServiceOrderViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet)
router.register("orders", ServiceOrderViewSet)
urlpatterns = [
    path("imports/preview/", imports.preview),
    path("imports/apply/", imports.apply),
    path("session/", auth.session),
    path("login/", auth.sign_in),
    path("logout/", auth.sign_out),
    path("", include(router.urls)),
]
