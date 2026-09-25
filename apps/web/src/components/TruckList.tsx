import { useState } from 'react'
import { useTrucks } from '@/hooks/useTrucks'
import { TruckForm } from './TruckForm'
import { Button } from './ui/button'
import { truckService } from '@/services/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Edit, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

export const TruckList = () => {
  const { trucks, loading, error, refetch, page, setPage, pagination } = useTrucks()
  const [editingTruck, setEditingTruck] = useState<number | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleEdit = (id: number) => {
    setEditingTruck(id)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingTruck(null)
    refetch()
  }

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este caminhão?')) {
      try {
        await truckService.delete(id)
        refetch()
      } catch (error) {
        console.error('Erro ao excluir caminhão:', error)
        alert('Erro ao excluir caminhão. Tente novamente.')
      }
    }
  }

  const formatCurrency = (value: string | null) => {
    if (value === null) return 'Not valued'
    const num = parseFloat(value)
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={refetch}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <p>{pagination.count} vehicles. Page {page}. FIPE values without confirmed metadata are legacy references.</p>
        <button disabled={!pagination.previous} onClick={()=>setPage(page-1)}>Previous</button>
        <button disabled={!pagination.next} onClick={()=>setPage(page+1)}>Next</button>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Gestão de Caminhões</h1>
          <Button onClick={() => setIsDialogOpen(true)}>
            Adicionar Caminhão
          </Button>
        </div>

        {trucks.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            Nenhum caminhão cadastrado
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Valor FIPE</TableHead>
                  <TableHead className="text-right">Mostrar Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trucks.map((truck) => (
                  <TableRow key={truck.id}>
                    <TableCell className="font-medium">
                      {truck.license_plate}
                    </TableCell>
                    <TableCell>{truck.brand}</TableCell>
                    <TableCell>{truck.model}</TableCell>
                    <TableCell>{truck.manufacturing_year}</TableCell>
                    <TableCell>{formatCurrency(truck.fipe_price)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(truck.id)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(truck.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTruck ? 'Editar Caminhão' : 'Adicionar Caminhão'}
            </DialogTitle>
          </DialogHeader>
          <TruckForm
            truckId={editingTruck}
            onSuccess={handleCloseDialog}
            onCancel={() => setIsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
