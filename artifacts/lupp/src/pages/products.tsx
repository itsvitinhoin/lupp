import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockProducts } from '@/data/mock';
import { Edit2, DownloadCloud, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Products() {
  const { toast } = useToast();

  const handleAction = (action: string) => {
    toast({
      title: action,
      description: "Ação simulada com sucesso.",
    });
  };

  return (
    <AppLayout title="Produtos Linkados">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h2>
          <p className="text-muted-foreground mt-1">Gerencie os produtos que aparecem nos seus vídeos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/10 bg-card/50" onClick={() => handleAction('Sincronizar')}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sincronizar
          </Button>
          <Button variant="outline" className="border-white/10 bg-card/50" onClick={() => handleAction('Importar')}>
            <DownloadCloud className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button className="shadow-lg shadow-primary/20" onClick={() => handleAction('Adicionar')}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      <Alert className="mb-8 border-primary/20 bg-primary/5 text-primary">
        <AlertCircle className="h-4 w-4 stroke-primary" />
        <AlertTitle>Catálogo não conectado</AlertTitle>
        <AlertDescription className="flex items-center justify-between mt-2">
          <span>Conecte sua plataforma para importar produtos automaticamente.</span>
          <Button size="sm" onClick={() => handleAction('Conectar')}>Conectar plataforma</Button>
        </AlertDescription>
      </Alert>

      <Card className="border-white/5 bg-card/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-[300px]">Produto</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead className="text-center">Vídeos Linkados</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">Add to Cart</TableHead>
                  <TableHead className="text-right">Receita Atribuída</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-white/5">
                {mockProducts.map((product) => (
                  <TableRow key={product.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md bg-white/5 border border-white/10 shrink-0"></div>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>R$ {product.price.toFixed(2).replace('.', ',')}</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                        {product.videosLinked}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{product.clicks}</TableCell>
                    <TableCell className="text-right">{product.addToCart}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-medium">
                      R$ {product.revenue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleAction('Editar ' + product.name)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
