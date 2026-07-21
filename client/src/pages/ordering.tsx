import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LazyVideoPlayer } from "@/components/shared/LazyVideoPlayer";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStore } from "@/hooks/useStore";
import { useVideos } from "@/hooks/useVideos";
import { videosService } from "@/services/videos.service";
import { GripVertical, Pin, RotateCcw, Save, Sparkles } from "lucide-react";

type OrderingMode = "manual" | "recent" | "views" | "clicks" | "likes" | "revenue";

function videoTitle(video: any) {
  return String(video.title || "").trim() || "Vídeo sem título";
}

function primaryProduct(video: any) {
  return (
    video.video_products?.find((item: any) => item.is_primary)?.products ??
    video.video_products?.[0]?.products ??
    null
  );
}

function previewImage(video: any) {
  return video.thumbnail_url || primaryProduct(video)?.image_url || "";
}

function sortVideos(videos: any[], mode: OrderingMode) {
  const sorted = [...videos];
  if (mode === "manual") {
    return sorted.sort((left, right) => {
      if (left.is_featured !== right.is_featured)
        return left.is_featured ? -1 : 1;
      return (left.sort_order ?? 0) - (right.sort_order ?? 0);
    });
  }
  if (mode === "recent") {
    return sorted.sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
  }
  if (mode === "views") {
    return sorted.sort(
      (left, right) => (right.metrics?.views ?? 0) - (left.metrics?.views ?? 0),
    );
  }
  if (mode === "clicks") {
    return sorted.sort(
      (left, right) =>
        (right.metrics?.clicks ?? 0) - (left.metrics?.clicks ?? 0),
    );
  }
  if (mode === "likes") {
    return sorted.sort(
      (left, right) => (right.metrics?.likes ?? 0) - (left.metrics?.likes ?? 0),
    );
  }
  return sorted.sort(
    (left, right) => (right.metrics?.revenue ?? 0) - (left.metrics?.revenue ?? 0),
  );
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function Ordering() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const videosQuery = useVideos(store?.id, "", "active");
  const videos = React.useMemo(
    () => (videosQuery.data ?? []).filter((video: any) => video.is_feed_enabled !== false),
    [videosQuery.data],
  );
  const [orderedVideos, setOrderedVideos] = React.useState<any[]>([]);
  const [mode, setMode] = React.useState<OrderingMode>("manual");
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setOrderedVideos(sortVideos(videos, "manual"));
  }, [videos]);

  const pinnedCount = orderedVideos.filter((video) => video.is_featured).length;

  const applyMode = (nextMode: OrderingMode) => {
    setMode(nextMode);
    setOrderedVideos(sortVideos(orderedVideos, nextMode));
  };

  const togglePinned = (videoId: string) => {
    setOrderedVideos((current) => {
      const video = current.find((item) => item.id === videoId);
      if (!video) return current;
      if (!video.is_featured && current.filter((item) => item.is_featured).length >= 3) {
        toast({
          title: "Limite de fixados",
          description: "Você pode fixar até 3 vídeos no início do feed.",
        });
        return current;
      }
      const next = current.map((item) =>
        item.id === videoId ? { ...item, is_featured: !item.is_featured } : item,
      );
      return sortVideos(next, "manual");
    });
  };

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setOrderedVideos((current) => {
      const from = current.findIndex((video) => video.id === draggedId);
      const to = current.findIndex((video) => video.id === targetId);
      if (from < 0 || to < 0) return current;
      return moveItem(current, from, to);
    });
    setMode("manual");
    setDraggedId(null);
  };

  const saveOrdering = async () => {
    if (!store) return;
    try {
      setIsSaving(true);
      await videosService.updateVideoOrdering(
        store.id,
        orderedVideos.map((video, index) => ({
          id: video.id,
          is_featured: Boolean(video.is_featured),
          sort_order: index + 1,
        })),
      );
      await queryClient.invalidateQueries({ queryKey: ["videos", store.id] });
      toast({
        title: "Ordenação salva",
        description: "O feed já vai priorizar os vídeos fixados e a ordem manual.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description:
          error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout title="Ordenação">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Ordenação do Feed
          </h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Defina quais vídeos aparecem primeiro na miniatura e no feed da Home.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={mode} onValueChange={(value) => applyMode(value as OrderingMode)}>
            <SelectTrigger className="h-11 w-full border-border bg-card sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="views">Mais vistos</SelectItem>
              <SelectItem value="clicks">Mais cliques</SelectItem>
              <SelectItem value="likes">Mais curtidos</SelectItem>
              <SelectItem value="revenue">Maior receita</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="gap-2 border-border bg-card"
            onClick={() => applyMode("manual")}
          >
            <RotateCcw className="h-4 w-4" />
            Recarregar manual
          </Button>
          <Button className="gap-2" onClick={saveOrdering} disabled={isSaving}>
            <Save className="h-4 w-4" />
            {isSaving ? "Salvando..." : "Salvar ordem"}
          </Button>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Vídeos ativos</span>
            <Badge variant="outline" className="bg-muted/50">
              {pinnedCount}/3 fixados
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {videosQuery.isLoading ? (
            <p className="rounded-xl border border-border bg-muted/50 p-5 text-sm text-muted-foreground">
              Carregando vídeos...
            </p>
          ) : orderedVideos.length ? (
            <div className="grid gap-3">
              {orderedVideos.map((video, index) => (
                <div
                  key={video.id}
                  draggable
                  onDragStart={() => setDraggedId(video.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(video.id)}
                  className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 sm:grid-cols-[28px_64px_1fr_auto] sm:items-center"
                >
                  <GripVertical className="h-5 w-5 cursor-move text-muted-foreground/70" />
                  <div className="aspect-[9/16] h-20 overflow-hidden rounded-lg bg-muted">
                    {previewImage(video) ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${previewImage(video)})`,
                        }}
                      />
                    ) : video.video_url ? (
                      <LazyVideoPlayer
                        src={video.video_url}
                        className="h-full w-full object-cover"
                        autoPlay={false}
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xs font-bold text-muted-foreground/70">
                        Sem prévia
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-muted/50">
                        #{index + 1}
                      </Badge>
                      {video.is_featured && (
                        <Badge className="bg-primary text-white">Fixado</Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-bold text-foreground">
                      {videoTitle(video)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs font-medium text-muted-foreground">
                      <span>{video.metrics?.views ?? 0} views</span>
                      <span>{video.metrics?.clicks ?? 0} cliques</span>
                      <span>{video.metrics?.likes ?? 0} likes</span>
                    </div>
                  </div>
                  <Button
                    variant={video.is_featured ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => togglePinned(video.id)}
                  >
                    {video.is_featured ? (
                      <Pin className="h-4 w-4 fill-current" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {video.is_featured ? "Fixado" : "Fixar"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm font-medium text-muted-foreground">
              Publique vídeos ativos no feed vertical para configurar a ordem da Home.
            </p>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
