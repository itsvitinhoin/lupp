import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { mockPages } from "@/data/mock";
import { Plus, Edit2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CustomPages() {
  const { toast } = useToast();

  const handleCreate = () => {
    toast({
      title: "Criar página",
      description: "Abrindo modal de criação de página.",
    });
  };

  return (
    <AppLayout title="Páginas Personalizadas">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Páginas de Vídeo
          </h2>
          <p className="mt-1 text-muted-foreground">
            Crie páginas exclusivas agrupando vídeos específicos.
          </p>
        </div>
        <Button onClick={handleCreate} className="shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" />
          Criar página
        </Button>
      </div>

      <Card className="border-border bg-card text-foreground shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="text-right">Vídeos</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {mockPages.map((page) => (
                  <TableRow
                    key={page.id}
                    className="border-border hover:bg-muted/50"
                  >
                    <TableCell className="font-medium text-foreground">
                      {page.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {page.path}
                    </TableCell>
                    <TableCell className="text-right">
                      {page.videoCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {page.views.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {page.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={page.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                          asChild
                        >
                          <a
                            href="/preview/feed"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
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
