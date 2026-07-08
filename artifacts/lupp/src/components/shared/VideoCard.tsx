import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import {
  BarChart3,
  Copy,
  Edit2,
  Eye,
  Heart,
  MessageCircle,
  MoreVertical,
  MousePointerClick,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LazyVideoPlayer } from "./LazyVideoPlayer";
import { VideoPlayerMock } from "./VideoPlayerMock";

export interface VideoCardItem {
  id: string;
  title: string;
  status: "ativo" | "pausado" | "rascunho";
  views: number;
  likes: number;
  comments: number;
  clicks: number;
  revenue: number;
  productId: string | null;
  productName: string | null;
  products?: Array<{
    id?: string | null;
    imageUrl?: string | null;
    name: string;
  }>;
  thumbnail: string;
  videoUrl?: string | null;
  durationSeconds?: number | null;
}

interface VideoCardProps {
  video: VideoCardItem;
  onEdit?: (video: VideoCardItem) => void;
  onToggleStatus?: (video: VideoCardItem) => void;
  onDelete?: (video: VideoCardItem) => void;
}

export function VideoCard({
  video,
  onEdit,
  onToggleStatus,
  onDelete,
}: VideoCardProps) {
  const [detectedDuration, setDetectedDuration] = React.useState<number | null>(
    null,
  );
  const durationLabel = formatDuration(
    video.durationSeconds ?? detectedDuration,
  );

  return (
    <Card className="overflow-hidden border-slate-200 bg-white text-slate-950 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        {video.videoUrl ? (
          <LazyVideoPlayer
            src={video.videoUrl}
            poster={video.thumbnail || undefined}
            className="h-full w-full object-cover bg-black"
            autoPlay={false}
            muted
            loop
            preload="metadata"
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration) && duration > 0) {
                setDetectedDuration(duration);
              }
            }}
          />
        ) : (
          <VideoPlayerMock />
        )}
        <div className="absolute left-2 top-2">
          <StatusBadge status={video.status} />
        </div>
        <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-md">
          {durationLabel}
        </div>
      </div>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="line-clamp-2 font-semibold leading-tight text-slate-950">
              {video.title}
            </h4>
            {video.products?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {video.products.slice(0, 3).map((product) => (
                  <span
                    key={product.id ?? product.name}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/8 px-2 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="truncate">{product.name}</span>
                  </span>
                ))}
                {video.products.length > 3 && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                    +{video.products.length - 3}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-slate-500">
                Sem produto linkado
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 h-8 w-8 text-slate-500"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 border-slate-200 bg-white text-slate-700"
            >
              <DropdownMenuItem onClick={() => onEdit?.(video)}>
                <Edit2 className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus?.(video)}>
                {video.status === "ativo" ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> Ativar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                onClick={() => onDelete?.(video)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="flex flex-col items-center justify-center rounded-md bg-slate-100 p-2 text-slate-700">
            <Eye className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium">
              {video.views.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-slate-100 p-2 text-slate-700">
            <Heart className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium">
              {video.likes.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-slate-100 p-2 text-slate-700">
            <MessageCircle className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium">
              {video.comments.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-slate-100 p-2 text-slate-700">
            <MousePointerClick className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium">
              {video.clicks.toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="flex w-full items-center justify-between rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Receita</span>
          </div>
          <span className="font-semibold text-emerald-500">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(video.revenue)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

function formatDuration(value?: number | null) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";

  const totalSeconds = Math.max(1, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
