import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { mockComments } from '@/data/mock';
import { Check, EyeOff, MessageSquareReply, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Comments() {
  const { toast } = useToast();

  const handleAction = (action: string, name: string) => {
    toast({
      title: action,
      description: `Ação aplicada ao comentário de ${name}.`,
    });
  };

  return (
    <AppLayout title="Comentários e Moderação">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="todos" className="w-full">
            <TabsList className="bg-card/50 border border-white/5 mb-6">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
              <TabsTrigger value="aprovados">Aprovados</TabsTrigger>
              <TabsTrigger value="ocultos">Ocultos</TabsTrigger>
              <TabsTrigger value="denunciados">Denunciados</TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              {mockComments.map((comment) => (
                <Card key={comment.id} className="border-white/5 bg-card/50">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold shrink-0">
                        {comment.userName.charAt(0)}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold mr-2">{comment.userName}</span>
                            <span className="text-xs text-muted-foreground">{comment.date}</span>
                          </div>
                          <StatusBadge status={comment.status} />
                        </div>
                        
                        <p className="text-sm">{comment.text}</p>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-white/5 rounded-md px-2 py-1 w-fit">
                          <span>Vídeo: <span className="font-medium text-foreground">{comment.videoTitle}</span></span>
                          {comment.productName && (
                            <>
                              <span>•</span>
                              <span>Produto: <span className="font-medium text-primary">{comment.productName}</span></span>
                            </>
                          )}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" className="h-8 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10" onClick={() => handleAction('Aprovar', comment.userName)}>
                            <Check className="mr-1.5 h-3.5 w-3.5" /> Aprovar
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 border-white/10" onClick={() => handleAction('Ocultar', comment.userName)}>
                            <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Ocultar
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 border-white/10" onClick={() => handleAction('Responder', comment.userName)}>
                            <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" /> Responder
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive" onClick={() => handleAction('Excluir', comment.userName)}>
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
          <Card className="sticky top-24 border-white/5 bg-card/50">
            <CardHeader>
              <CardTitle>Configurações de Moderação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { label: 'Ativar comentários nos vídeos', checked: true },
                { label: 'Exigir aprovação manual', checked: true },
                { label: 'Ocultar palavras ofensivas', checked: true },
                { label: 'Permitir respostas entre usuários', checked: false },
                { label: 'Mostrar contador de likes', checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Label className="text-sm cursor-pointer">{item.label}</Label>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
              
              <div className="pt-4 border-t border-white/5">
                <p className="text-sm text-muted-foreground italic">
                  Comentários engajam usuários e podem aumentar a conversão. Modere com cuidado.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
