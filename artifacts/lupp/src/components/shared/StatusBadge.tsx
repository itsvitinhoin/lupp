import React from 'react';
import { Badge } from '@/components/ui/badge';

type StatusType = 'ativo' | 'inativo' | 'pausado' | 'rascunho' | 'pendente' | 'aprovado' | 'oculto' | 'denunciado' | 'disponível' | 'em breve' | 'enterprise';

interface StatusBadgeProps {
  status: StatusType;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'ativo':
      case 'aprovado':
      case 'disponível':
        return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20';
      case 'inativo':
      case 'pausado':
      case 'oculto':
      case 'em breve':
        return 'bg-muted text-muted-foreground hover:bg-muted/80 border-border';
      case 'rascunho':
      case 'pendente':
        return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20';
      case 'denunciado':
        return 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20';
      case 'enterprise':
        return 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20';
      default:
        return 'bg-muted text-muted-foreground hover:bg-muted/80';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'ativo': return 'Ativo';
      case 'inativo': return 'Inativo';
      case 'pausado': return 'Pausado';
      case 'rascunho': return 'Rascunho';
      case 'pendente': return 'Pendente';
      case 'aprovado': return 'Aprovado';
      case 'oculto': return 'Oculto';
      case 'denunciado': return 'Denunciado';
      case 'disponível': return 'Disponível';
      case 'em breve': return 'Em breve';
      case 'enterprise': return 'Enterprise';
      default: return status;
    }
  };

  return (
    <Badge variant="outline" className={`font-medium ${getStatusStyles()}`}>
      {getStatusLabel()}
    </Badge>
  );
}
