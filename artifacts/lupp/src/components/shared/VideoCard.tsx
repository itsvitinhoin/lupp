import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video } from '@/data/mock';
import { StatusBadge } from './StatusBadge';
import { BarChart3, Copy, Edit2, Eye, Heart, MessageCircle, MoreVertical, MousePointerClick, Pause, Play, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { VideoPlayerMock } from './VideoPlayerMock';

interface VideoCardProps {
  video: Video;
  onEdit?: (video: Video) => void;
  onToggleStatus?: (video: Video) => void;
  onDelete?: (video: Video) => void;
}

export function VideoCard({ video, onEdit, onToggleStatus, onDelete }: VideoCardProps) {
  return (
    <Card className="overflow-hidden border-white/5 bg-card/50 backdrop-blur-sm transition-all hover:border-white/10 hover:shadow-md hover:shadow-primary/5">
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        <VideoPlayerMock />
        <div className="absolute left-2 top-2">
          <StatusBadge status={video.status} />
        </div>
        <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-md">
          0:15
        </div>
      </div>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="line-clamp-2 font-medium leading-tight">{video.title}</h4>
            {video.productName ? (
              <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                {video.productName}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground italic">Sem produto linkado</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-white/10 bg-card/95 backdrop-blur-xl">
              <DropdownMenuItem onClick={() => onEdit?.(video)}>
                <Edit2 className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus?.(video)}>
                {video.status === 'ativo' ? (
                  <><Pause className="mr-2 h-4 w-4" /> Pausar</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" /> Ativar</>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => onDelete?.(video)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="flex flex-col items-center justify-center rounded-md bg-muted/50 p-2">
            <Eye className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{video.views.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-muted/50 p-2">
            <Heart className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{video.likes.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-muted/50 p-2">
            <MessageCircle className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{video.comments.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-muted/50 p-2">
            <MousePointerClick className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{video.clicks.toLocaleString()}</span>
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
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(video.revenue)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
