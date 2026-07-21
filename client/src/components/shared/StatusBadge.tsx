import React from "react";
import { Badge } from "@/components/ui/badge";

type StatusType =
  | "ativo"
  | "inativo"
  | "pausado"
  | "rascunho"
  | "pendente"
  | "aprovado"
  | "oculto"
  | "denunciado"
  | "disponível"
  | "em breve"
  | "enterprise";

interface StatusBadgeProps {
  status: StatusType;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case "ativo":
      case "aprovado":
      case "disponível":
        return "bg-success/10 text-success hover:bg-success/20 border-success/20";
      case "inativo":
      case "pausado":
      case "oculto":
      case "em breve":
        return "border-border bg-muted text-muted-foreground hover:bg-muted";
      case "rascunho":
      case "pendente":
        return "bg-warning/10 text-warning hover:bg-warning/20 border-warning/20";
      case "denunciado":
        return "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20";
      case "enterprise":
        return "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20";
      default:
        return "border-border bg-muted text-muted-foreground hover:bg-muted";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "ativo":
        return "Ativo";
      case "inativo":
        return "Inativo";
      case "pausado":
        return "Pausado";
      case "rascunho":
        return "Rascunho";
      case "pendente":
        return "Pendente";
      case "aprovado":
        return "Aprovado";
      case "oculto":
        return "Oculto";
      case "denunciado":
        return "Denunciado";
      case "disponível":
        return "Disponível";
      case "em breve":
        return "Em breve";
      case "enterprise":
        return "Enterprise";
      default:
        return status;
    }
  };

  return (
    <Badge variant="outline" className={`font-medium ${getStatusStyles()}`}>
      {getStatusLabel()}
    </Badge>
  );
}
