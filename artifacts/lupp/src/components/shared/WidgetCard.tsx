import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Widget } from '@/data/mock';
import { Code, Settings, Eye } from 'lucide-react';

interface WidgetCardProps {
  widget: Widget;
  onToggle?: (widget: Widget, active: boolean) => void;
  onConfigure?: (widget: Widget) => void;
  onCopyCode?: (widget: Widget) => void;
  onPreview?: (widget: Widget) => void;
}

export function WidgetCard({ widget, onToggle, onConfigure, onCopyCode, onPreview }: WidgetCardProps) {
  const isActive = widget.status === 'ativo';

  return (
    <Card className={`border-white/5 transition-all ${isActive ? 'bg-card/80 border-primary/20 shadow-md shadow-primary/5' : 'bg-card/30'}`}>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-lg">{widget.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{widget.description}</p>
        </div>
        <Switch 
          checked={isActive} 
          onCheckedChange={(c) => onToggle?.(widget, c)} 
        />
      </CardHeader>
      <CardContent>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onConfigure?.(widget)}>
            <Settings className="mr-2 h-4 w-4" /> Configurar
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onCopyCode?.(widget)}>
            <Code className="mr-2 h-4 w-4" /> Código
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onPreview?.(widget)}>
            <Eye className="mr-2 h-4 w-4" /> Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
