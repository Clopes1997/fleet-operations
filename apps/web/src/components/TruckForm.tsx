import { useState, useEffect } from 'react'
import { truckService, TruckFormData } from '@/services/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface TruckFormProps {
  truckId?: number | null
  onSuccess: () => void
  onCancel: () => void
}

export const TruckForm = ({ truckId, onSuccess, onCancel }: TruckFormProps) => {
  const [formData, setFormData] = useState<TruckFormData>({
    license_plate: '',
    brand: '',
    model: '',
    manufacturing_year: new Date().getFullYear(),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (truckId) {
      truckService.getById(truckId).then((truck) => {
        setFormData({
          license_plate: truck.license_plate,
          brand: truck.brand,
          model: truck.model,
          manufacturing_year: truck.manufacturing_year,
        })
      }).catch((error: unknown) => setError(error instanceof Error ? error.message : "Erro ao carregar caminhão"))
    }
  }, [truckId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (truckId) {
        await truckService.update(truckId, formData)
      } else {
        await truckService.create(formData)
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar caminhão');
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof TruckFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error.split('\n').map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="license_plate">Placa *</Label>
        <Input
          id="license_plate"
          value={formData.license_plate}
          onChange={(e) => handleChange('license_plate', e.target.value.toUpperCase())}
          placeholder="ABC1234"
          required
          maxLength={7}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand">Marca *</Label>
        <Input
          id="brand"
          value={formData.brand}
          onChange={(e) => handleChange('brand', e.target.value)}
          placeholder="Scania"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">Modelo *</Label>
        <Input
          id="model"
          value={formData.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="FH 540"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="manufacturing_year">Ano de Fabricação *</Label>
        <Input
          id="manufacturing_year"
          type="number"
          value={formData.manufacturing_year}
          onChange={(e) => handleChange('manufacturing_year', parseInt(e.target.value) || 0)}
          min={1900}
          max={2100}
          required
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Salvando...' : truckId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  )
}
