import React from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { StatCard } from "@/components/shared/StatCard";
import { useToast } from "@/hooks/use-toast";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminBunnyVideo } from "@/types/admin-console";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  HardDrive,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import { AdminGate, AdminShell } from "./shared";

const ITEMS_PER_PAGE = 25;

// Bunny's own encode-status codes — mirrors bunnyStatus() in
// server/src/lib/bunny.ts (4/8 ready, 5/6 failed, anything else processing).
function bunnyStatusLabel(status: number | null) {
  if (status === 4 || status === 8) return { label: "Pronto", tone: "success" as const };
  if (status === 5 || status === 6) return { label: "Falhou", tone: "destructive" as const };
  return { label: "Processando", tone: "info" as const };
}

function statusBadgeClass(tone: "success" | "destructive" | "info") {
  if (tone === "success") {
    return "border-success-surface-border bg-success-surface text-success-surface-foreground";
  }
  if (tone === "destructive") {
    return "border-destructive-surface-border bg-destructive-surface text-destructive";
  }
  return "border-info-surface-border bg-info-surface text-info-surface-foreground";
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export default function AdminBunnyPage() {
  return (
    <AdminGate>
      {({ adminEmail, onSignOut }) => (
        <BunnyConsole adminEmail={adminEmail} onSignOut={onSignOut} />
      )}
    </AdminGate>
  );
}

function BunnyConsole({
  adminEmail,
  onSignOut,
}: {
  adminEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const summaryQuery = useQuery({
    queryKey: ["admin-console", "bunny", "summary"],
    queryFn: () => adminConsoleService.getBunnySummary(),
    retry: false,
  });

  const videosQuery = useQuery({
    queryKey: ["admin-console", "bunny", "videos", page, debouncedSearch],
    queryFn: () =>
      adminConsoleService.getBunnyVideos({
        page,
        itemsPerPage: ITEMS_PER_PAGE,
        search: debouncedSearch,
      }),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (guid: string) => adminConsoleService.deleteBunnyVideo(guid),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-console", "bunny"] }),
      ]);
      toast({ title: "Vídeo removido", description: "Bunny e o banco de dados foram atualizados." });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível remover o vídeo",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    },
  });

  const handleDelete = (video: AdminBunnyVideo) => {
    const label = video.title || video.guid;
    const relatedNote = video.db
      ? ` Isso também remove o vídeo "${video.db.title}" da loja ${video.db.store?.name ?? "?"} e seus vínculos com produtos.`
      : "";
    if (
      !window.confirm(
        `Remover "${label}" do Bunny permanentemente?${relatedNote} Essa ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(video.guid);
  };

  const summary = summaryQuery.data;
  const videosPage = videosQuery.data;
  const totalPages = videosPage
    ? Math.max(1, Math.ceil(videosPage.totalItems / videosPage.itemsPerPage))
    : 1;

  return (
    <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
      <div className="space-y-6">
        <div>
          <h1 className="text-page-title text-foreground">Bunny Stream</h1>
          <p className="text-sm font-medium text-muted-foreground">
            Vídeos hospedados na biblioteca compartilhada, com a relação de cada um com a loja e o
            produto conhecidos por este app.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Video}
            label="Vídeos na Bunny"
            value={summary?.bunny_video_count != null ? String(summary.bunny_video_count) : "—"}
          />
          <StatCard
            icon={Database}
            label="Vídeos no banco (provider bunny)"
            value={summary ? String(summary.local_video_count) : "—"}
          />
          <StatCard
            icon={HardDrive}
            label="Armazenamento (banco local)"
            value={summary ? formatBytes(summary.local_storage_bytes) : "—"}
          />
          <Card className="border-border bg-card text-foreground shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground">
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs font-semibold text-muted-foreground">
              <p>
                Library ID: <span className="text-foreground">{summary?.library_id ?? "—"}</span>
              </p>
              <p className="truncate">
                CDN: <span className="text-foreground">{summary?.cdn_hostname ?? "—"}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-info-surface-border bg-info-surface text-info-surface-foreground">
          <CardContent className="p-4 text-xs font-semibold">
            Preço e faturas não estão disponíveis aqui: este app só tem uma chave de API da Bunny
            escopada à biblioteca de Stream, não uma chave de conta. Para custos/pagamentos reais,
            consulte o painel da Bunny.net diretamente.
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-foreground shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-foreground">Vídeos</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por título..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="gap-3">
            {videosQuery.isLoading ? (
              <p className="text-sm font-semibold text-muted-foreground">Carregando...</p>
            ) : !videosPage?.items.length ? (
              <EmptyState message="Nenhum vídeo encontrado." />
            ) : (
              videosPage.items.map((video) => {
                const statusInfo = bunnyStatusLabel(video.status);
                return (
                  <ListItem key={video.guid} variant="panel">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {video.thumbnailUrl ? (
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-16 w-11 shrink-0 rounded-md object-cover bg-muted"
                          />
                        ) : (
                          <div className="h-16 w-11 shrink-0 rounded-md bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="font-black text-foreground">
                            {video.title || "(sem título)"}
                          </p>
                          <p className="text-xs font-bold text-muted-foreground">
                            {video.guid}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                            <Badge className={`border ${statusBadgeClass(statusInfo.tone)}`}>
                              {statusInfo.label}
                            </Badge>
                            <span>{formatDuration(video.length)}</span>
                            <span>
                              {video.width && video.height
                                ? `${video.width}×${video.height}`
                                : "—"}
                            </span>
                            <span>{formatBytes(video.storageSize)}</span>
                            <span>{formatNumber(video.views)} views</span>
                            <span>{formatDateTime(video.dateUploaded)}</span>
                          </div>
                          <div className="mt-2 text-xs font-semibold">
                            {video.db ? (
                              <span className="text-muted-foreground">
                                Loja:{" "}
                                {video.db.store ? (
                                  <Link
                                    href={`/admin/${video.db.store.id}`}
                                    className="text-foreground underline-offset-2 hover:underline"
                                  >
                                    {video.db.store.name}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                                {video.db.products.length ? (
                                  <>
                                    {" "}
                                    · Produtos:{" "}
                                    {video.db.products.map((product) => product.name).join(", ")}
                                  </>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-warning-surface-foreground">
                                Sem vídeo correspondente no banco (órfão)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-destructive-surface-border text-destructive hover:bg-destructive-surface"
                        disabled={deleteMutation.isPending}
                        onClick={() => handleDelete(video)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    </div>
                  </ListItem>
                );
              })
            )}

            {videosPage && videosPage.totalItems > 0 ? (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs font-bold text-muted-foreground">
                  Página {page} de {totalPages} · {videosPage.totalItems} vídeos
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function formatNumber(value: number | null) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}
