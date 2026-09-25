from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('trucks.urls')),
    path('api/', include('operations.urls')),
]

