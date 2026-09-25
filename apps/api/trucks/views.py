from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .services.fipe_client import FipeClient, FipeUnavailable
from rest_framework.permissions import IsAuthenticated
from .models import Truck
from .serializers import TruckSerializer


class TruckViewSet(viewsets.ModelViewSet):
    queryset = Truck.objects.all()
    serializer_class = TruckSerializer

    def get_permissions(self):
        if self.action == 'valuation':
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=False, methods=['get'])
    def fipe(self, request):
        try:
            brand, model = request.query_params.get('brand'), request.query_params.get('model')
            result = FipeClient.get_years('trucks', brand, model) if model else FipeClient.get_models('trucks', brand) if brand else FipeClient.get_brands()
            return Response(result)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        except FipeUnavailable as exc:
            return Response({'detail': str(exc)}, status=503)

    @action(detail=True, methods=['post'])
    def valuation(self, request, pk=None):
        if not request.user.has_perm('trucks.change_truck'):
            return Response({'detail': 'Change permission required'}, status=403)
        instance = self.get_object()
        try:
            codes = [request.data.get(k, '') for k in ('brand_code', 'model_code', 'year_code')]
            price, source = FipeClient.quote(*codes)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        except FipeUnavailable as exc:
            return Response({'detail': str(exc)}, status=503)
        instance.fipe_price = price
        instance.fipe_metadata = {'codes': codes, 'source': source, 'retrieved_at': timezone.now().isoformat(),
                                  'identity': [instance.brand, instance.model, instance.manufacturing_year]}
        instance.save(update_fields=['fipe_price', 'fipe_metadata', 'updated_at'])
        return Response(self.get_serializer(instance).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
