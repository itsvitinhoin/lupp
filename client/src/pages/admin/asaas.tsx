import { AdminGate, AdminShell } from "./shared";
import { AsaasPanel } from "./asaas-panel";

export default function AdminAsaasPage() {
  return (
    <AdminGate>
      {({ adminEmail, onSignOut }) => (
        <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
          <div className="mb-6">
            <h2 className="text-page-title text-foreground">Financeiro Asaas</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Saldo, cobranças, assinaturas, clientes e notas fiscais lidos ao
              vivo da conta Asaas.
            </p>
          </div>
          <AsaasPanel />
        </AdminShell>
      )}
    </AdminGate>
  );
}
