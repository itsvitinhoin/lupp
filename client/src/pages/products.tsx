import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Edit2,
  DownloadCloud,
  Plus,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCurrentStore } from "@/hooks/useStore";
import { useProducts } from "@/hooks/useProducts";
import { productsService } from "@/services/products.service";
import { useQueryClient } from "@tanstack/react-query";

function formatMoney(value?: number | null) {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export default function Products() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const productsQuery = useProducts(store?.id);
  const products = productsQuery.data ?? [];
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("Vestido Midi Azul");
  const [price, setPrice] = React.useState("189.90");
  const [productUrl, setProductUrl] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleAction = (action: string) => {
    toast({ title: action, description: "Ação simulada com sucesso." });
  };

  const handleSyncProducts = async () => {
    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "Conclua o onboarding antes de sincronizar produtos.",
      });
      return;
    }

    try {
      setIsSyncing(true);
      const result = (await productsService.syncProductsForStore(store)) as {
        count?: number;
        images_found?: number;
        variants_with_attributes?: number;
      };
      await queryClient.invalidateQueries({ queryKey: ["products", store.id] });
      const providerName =
        store.platform === "upzero" ? "UP Zero" : "Nuvemshop";
      toast({
        title: "Produtos sincronizados",
        description:
          store.platform === "upzero"
            ? `${result.count ?? 0} produtos da ${providerName}. ${result.images_found ?? 0} com foto, ${result.variants_with_attributes ?? 0} variantes com cor/tamanho.`
            : `${result.count ?? 0} produtos importados ou atualizados da ${providerName}.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível sincronizar",
        description:
          error instanceof Error
            ? error.message
            : "Conecte a integração antes de sincronizar.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!store) {
      toast({
        title: "Crie uma loja primeiro",
        description: "Conclua o onboarding antes de cadastrar produtos.",
      });
      return;
    }

    if (!name.trim()) {
      toast({ title: "Informe o nome do produto." });
      return;
    }

    try {
      setIsSaving(true);
      await productsService.createProduct({
        store_id: store.id,
        name: name.trim(),
        price: Number(price) || null,
        product_url:
          productUrl.trim() ||
          `${window.location.origin}/test-store/${store.slug}/produto-demo`,
        platform: store.platform,
        status: "active",
      });
      await queryClient.invalidateQueries({ queryKey: ["products", store.id] });
      setIsDialogOpen(false);
      toast({
        title: "Produto criado",
        description: "Agora você já pode linkar esse produto em um vídeo.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível criar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout title="Produtos Linkados">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Catálogo de Produtos
          </h2>
          <p className="mt-1 text-muted-foreground">
            Gerencie os produtos que aparecem nos seus vídeos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-border bg-card"
            onClick={() => void handleSyncProducts()}
            disabled={isSyncing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          <Button
            variant="outline"
            className="border-border bg-card"
            onClick={() => handleAction("Importar")}
          >
            <DownloadCloud className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button
            className="shadow-lg shadow-primary/20"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      {!products.length && (
        <Alert className="mb-8 border-primary/20 bg-primary/5 text-primary">
          <AlertCircle className="h-4 w-4 stroke-primary" />
          <AlertTitle>Catálogo pronto para teste</AlertTitle>
          <AlertDescription className="flex items-center justify-between mt-2 gap-4">
            <span>
              Adicione um produto real para linkar no upload do vídeo.
            </span>
            <Button size="sm" onClick={() => setIsDialogOpen(true)}>
              Adicionar produto
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[300px] text-muted-foreground">
                    Produto
                  </TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {products.map((product: any) => (
                  <TableRow
                    key={product.id}
                    className="border-border hover:bg-muted/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-md bg-muted bg-cover bg-center border border-border shrink-0"
                          style={{
                            backgroundImage: product.image_url
                              ? `url(${product.image_url})`
                              : undefined,
                          }}
                        />
                        <span className="font-medium text-foreground">
                          {product.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground/80">
                      {formatMoney(product.price)}
                    </TableCell>
                    <TableCell className="text-foreground/80">
                      {product.status ?? "mock"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {product.product_url ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => handleAction("Editar " + product.name)}
                      >
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Adicionar produto teste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Nome</Label>
              <Input
                id="product-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-price">Preço</Label>
              <Input
                id="product-price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-url">URL do produto</Label>
              <Input
                id="product-url"
                value={productUrl}
                onChange={(event) => setProductUrl(event.target.value)}
                placeholder="Opcional: usa a loja teste se vazio"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreateProduct()}
              disabled={isSaving}
            >
              {isSaving ? "Salvando..." : "Criar produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
