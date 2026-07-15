import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Code, Settings, Eye } from 'lucide-react';

export interface WidgetCardItem {
  id: string;
  name: string;
  description: string;
  status: 'ativo' | 'inativo' | 'active' | 'inactive';
  type?: string;
}

interface WidgetCardProps {
  widget: WidgetCardItem;
  onToggle?: (widget: WidgetCardItem, active: boolean) => void;
  onConfigure?: (widget: WidgetCardItem) => void;
  onCopyCode?: (widget: WidgetCardItem) => void;
  onPreview?: (widget: WidgetCardItem) => void;
}

export function WidgetCard({ widget, onToggle, onConfigure, onCopyCode, onPreview }: WidgetCardProps) {
  const isActive = widget.status === 'ativo' || widget.status === 'active';

  return (
    <Card className={`bg-white transition-all ${isActive ? 'border-primary/30 shadow-md shadow-primary/10' : ''}`}>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-lg">{widget.name}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{widget.description}</p>
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
