import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMissingRequiredEnv } from "@/lib/env";
import { AlertCircle } from "lucide-react";

export function EnvNotice() {
  const missing = getMissingRequiredEnv();
  if (!missing.length) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
      <AlertCircle className="h-4 w-4 stroke-amber-300" />
      <AlertTitle>Configuração pendente</AlertTitle>
      <AlertDescription className="text-amber-100/80">
        Preencha {missing.join(" e ")} para usar conta, sessão e loja no banco real.
      </AlertDescription>
    </Alert>
  );
}
