import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, EyeOff, MessageSquare, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { commentsService } from "@/services/comments.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommentStatus } from "@/types/database";

const FILTERS: Record<string, "all" | CommentStatus> = {
  todos: "all",
  pendentes: "pending",
  aprovados: "approved",
  ocultos: "hidden",
  denunciados: "reported",
};

const STATUS_LABELS: Record<
  CommentStatus,
  Parameters<typeof StatusBadge>[0]["status"]
> = {
  pending: "pendente",
  approved: "aprovado",
  hidden: "oculto",
  reported: "denunciado",
  deleted: "oculto",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getVideoTitle(comment: any) {
  return comment.videos?.title ?? "Vídeo sem título";
}

function getProductName(comment: any) {
  return (
    comment.videos?.video_products?.find((item: any) => item.products?.name)
      ?.products?.name ?? null
  );
}

export default function Comments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const [statusTab, setStatusTab] = React.useState("todos");

  const status = FILTERS[statusTab] ?? "all";
  const commentsQuery = useQuery({
    queryKey: ["comments", store?.id, status],
    queryFn: () => commentsService.listComments(store!.id, status),
    enabled: Boolean(store?.id),
  });
  const comments = commentsQuery.data ?? [];

  const refreshComments = async () => {
    await queryClient.invalidateQueries({ queryKey: ["comments", store?.id] });
  };

  const handleStatusUpdate = async (
    comment: any,
    nextStatus: CommentStatus,
    label: string,
  ) => {
    try {
      await commentsService.updateComment(comment.id, { status: nextStatus });
      await refreshComments();
      toast({
        title: label,
        description: `Comentário de ${comment.author_name || "cliente"} atualizado.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    }
  };

  const handleDelete = async (comment: any) => {
    try {
      await commentsService.deleteComment(comment.id);
      await refreshComments();
      toast({
        title: "Comentário excluído",
        description: "O comentário saiu da moderação.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível excluir",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    }
  };

  return (
    <AppLayout title="Comentários e Moderação">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tabs
            value={statusTab}
            onValueChange={setStatusTab}
            className="w-full"
          >
            <TabsList className="mb-6 border border-border bg-card text-muted-foreground">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
              <TabsTrigger value="aprovados">Aprovados</TabsTrigger>
              <TabsTrigger value="ocultos">Ocultos</TabsTrigger>
              <TabsTrigger value="denunciados">Denunciados</TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              {commentsQuery.isLoading && (
                <Card className="border-border bg-card">
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Carregando comentários...
                  </CardContent>
                </Card>
              )}

              {!commentsQuery.isLoading && !comments.length && (
                <Card className="border-border bg-card">
                  <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8" />
                    <p>Nenhum comentário encontrado neste filtro.</p>
                  </CardContent>
                </Card>
              )}

              {comments.map((comment: any) => (
                <Card key={comment.id} className="border-border bg-card">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
                        {(comment.author_name || "C").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div>
                            <span className="mr-2 font-semibold text-foreground">
                              {comment.author_name || "Cliente"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(comment.created_at)}
                            </span>
                          </div>
                          <StatusBadge
                            status={
                              STATUS_LABELS[comment.status as CommentStatus]
                            }
                          />
                        </div>

                        <p className="text-sm text-foreground/80">{comment.body}</p>

                        <div className="flex w-fit items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                          <span>
                            Vídeo:{" "}
                            <span className="font-medium text-foreground">
                              {getVideoTitle(comment)}
                            </span>
                          </span>
                          {getProductName(comment) && (
                            <>
                              <span>•</span>
                              <span>
                                Produto:{" "}
                                <span className="font-medium text-primary">
                                  {getProductName(comment)}
                                </span>
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {comment.status !== "approved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-success/20 text-success hover:bg-success/10"
                              onClick={() =>
                                handleStatusUpdate(
                                  comment,
                                  "approved",
                                  "Comentário aprovado",
                                )
                              }
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" /> Aprovar
                            </Button>
                          )}
                          {comment.status !== "hidden" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-border bg-card text-foreground/80 hover:bg-muted/50"
                              onClick={() =>
                                handleStatusUpdate(
                                  comment,
                                  "hidden",
                                  "Comentário ocultado",
                                )
                              }
                            >
                              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Ocultar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(comment)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Tabs>
        </div>

        <div>
          <Card className="sticky top-24 border-border bg-card">
            <CardHeader>
              <CardTitle>Configurações de Moderação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { label: "Ativar comentários nos vídeos", checked: true },
                { label: "Exigir aprovação manual", checked: true },
                { label: "Ocultar palavras ofensivas", checked: true },
                { label: "Permitir respostas entre usuários", checked: false },
                { label: "Mostrar contador de likes", checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Label className="cursor-pointer text-sm text-foreground/80">
                    {item.label}
                  </Label>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}

              <div className="border-t border-border pt-4">
                <p className="text-sm italic text-muted-foreground">
                  Comentários enviados no feed entram como pendentes e aparecem
                  aqui para aprovação.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
