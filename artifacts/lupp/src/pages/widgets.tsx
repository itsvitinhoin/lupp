import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WidgetCard } from '@/components/shared/WidgetCard';
import { mockWidgets, Widget } from '@/data/mock';
import { useToast } from '@/hooks/use-toast';

export default function Widgets() {
  const { toast } = useToast();
  const [widgets, setWidgets] = React.useState<Widget[]>(mockWidgets);

  const handleToggle = (widget: Widget, active: boolean) => {
    setWidgets(widgets.map(w => 
      w.id === widget.id ? { ...w, status: active ? 'ativo' : 'inativo' } : w
    ));
    toast({
      title: active ? "Widget ativado" : "Widget desativado",
      description: `O widget ${widget.name} foi ${active ? 'ativado' : 'desativado'}.`,
    });
  };

  const handleCopyCode = (widget: Widget) => {
    const code = `<script src="https://cdn.lupp.app/widget.js" data-store="bella-moda" data-widget="${widget.id}"></script>`;
    navigator.clipboard.writeText(code);
    toast({
      title: "Código copiado!",
      description: "O código do widget foi copiado para a área de transferência.",
    });
  };

  const handleConfigure = (widget: Widget) => {
    toast({
      title: "Configuração",
      description: "Abrindo painel de configuração para " + widget.name,
    });
  };

  const handlePreview = (widget: Widget) => {
    toast({
      title: "Preview",
      description: "Abrindo visualização do widget " + widget.name,
    });
  };

  return (
    <AppLayout title="Widgets e Embeds">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Widgets da Loja</h2>
          <p className="text-muted-foreground mt-1">Instale e configure os widgets da Lupp no seu site.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {widgets.map(widget => (
          <WidgetCard 
            key={widget.id} 
            widget={widget} 
            onToggle={handleToggle}
            onCopyCode={handleCopyCode}
            onConfigure={handleConfigure}
            onPreview={handlePreview}
          />
        ))}
      </div>
    </AppLayout>
  );
}
