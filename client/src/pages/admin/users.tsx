import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminConsoleStoreRow, AdminPlatformUser } from "@/types/admin-console";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, MailCheck, MailX, Trash2, UserPlus } from "lucide-react";
import { AdminGate, AdminShell, formatDateTime, initials } from "./shared";
import {
  CursorListPanel,
  DetailField,
  DetailGrid,
  ExpandableListRow,
  MEMBER_ROLE_OPTIONS,
} from "./store/shared";

const PLATFORM_ROLE_OPTIONS = ["admin", "manager", "agent"] as const;

type UserActionInput =
  | { action: "add_user_to_store"; role: string; targetStoreId: string; userId: string }
  | { action: "remove_user_from_store"; targetStoreId: string; userId: string }
  | { action: "reset_user_password"; userId: string }
  | { action: "set_user_email_confirmed"; confirmed: boolean; userId: string }
  | { action: "set_user_role"; role: string; userId: string };

type RunUserAction = (input: UserActionInput) => void;

function roleTone(role: string) {
  if (role === "admin") return "border-info-surface-border bg-info-surface text-info-surface-foreground";
  if (role === "manager") return "border-warning-surface-border bg-warning-surface text-warning-surface-foreground";
  return "border-border bg-muted/50 text-muted-foreground";
}

export default function AdminUsersPage() {
  return (
    <AdminGate>
      {({ adminEmail, onSignOut }) => (
        <UsersConsole adminEmail={adminEmail} onSignOut={onSignOut} />
      )}
    </AdminGate>
  );
}

function UsersConsole({
  adminEmail,
  onSignOut,
}: {
  adminEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [confirmedFilter, setConfirmedFilter] = React.useState("all");
  const [storeFilter, setStoreFilter] = React.useState("all");
  const [passwordResult, setPasswordResult] = React.useState<{
    email: string;
    password: string;
  } | null>(null);

  // Reused across admin pages under the same query key — the store picker
  // here piggybacks on whatever the Home/Store pages already cached.
  const snapshotQuery = useQuery({
    queryKey: ["admin-console"],
    queryFn: () => adminConsoleService.getSnapshot(),
    retry: false,
  });
  const stores = snapshotQuery.data?.stores ?? [];

  const actionMutation = useMutation({
    mutationFn: (input: UserActionInput) => {
      switch (input.action) {
        case "set_user_role":
          return adminConsoleService.runAction("set_user_role", {
            role: input.role,
            user_id: input.userId,
          });
        case "set_user_email_confirmed":
          return adminConsoleService.runAction("set_user_email_confirmed", {
            confirmed: input.confirmed,
            user_id: input.userId,
          });
        case "reset_user_password":
          return adminConsoleService.runAction("reset_user_password", {
            user_id: input.userId,
          });
        case "add_user_to_store":
          return adminConsoleService.runAction("add_user_to_store", {
            role: input.role,
            target_store_id: input.targetStoreId,
            user_id: input.userId,
          });
        case "remove_user_from_store":
          return adminConsoleService.runAction("remove_user_from_store", {
            target_store_id: input.targetStoreId,
            user_id: input.userId,
          });
      }
    },
    onSuccess: async (data, input) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-console", "users"] });

      if (input.action === "reset_user_password") {
        const result = data.result as { password?: string; user?: { email?: string } };
        if (result.password) {
          setPasswordResult({ email: result.user?.email ?? "", password: result.password });
        }
        return;
      }

      toast({ title: "Ação executada", description: "O usuário foi atualizado." });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível executar",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    },
  });

  const runAction: RunUserAction = (input) => actionMutation.mutate(input);

  return (
    <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
      <div className="mb-6">
        <h2 className="text-page-title text-foreground">Usuários da plataforma</h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Todas as contas Luup — papéis, confirmação de e-mail, senha e vínculo com lojas.
        </p>
      </div>

      <CursorListPanel<AdminPlatformUser>
        title="Usuários"
        countNoun="usuário(s)"
        queryKey={["admin-console", "users"]}
        fetchPage={({ cursor, search }) =>
          adminConsoleService.getUsers({
            cursor,
            emailConfirmed: confirmedFilter === "all" ? undefined : (confirmedFilter as "true" | "false"),
            role: roleFilter === "all" ? undefined : roleFilter,
            search,
            storeId: storeFilter === "all" ? undefined : storeFilter,
          })
        }
        extraKey={[roleFilter, confirmedFilter, storeFilter]}
        hasExtraFilters={roleFilter !== "all" || confirmedFilter !== "all" || storeFilter !== "all"}
        searchPlaceholder="Buscar por nome ou e-mail"
        emptyMessage="Nenhum usuário cadastrado."
        emptyFilteredMessage="Nenhum usuário corresponde aos filtros."
        extraFilters={
          <div className="flex flex-wrap gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-36 bg-card text-sm font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os papéis</SelectItem>
                {PLATFORM_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={confirmedFilter} onValueChange={setConfirmedFilter}>
              <SelectTrigger className="h-9 w-48 bg-card text-sm font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">E-mail: todos</SelectItem>
                <SelectItem value="true">E-mail confirmado</SelectItem>
                <SelectItem value="false">E-mail não confirmado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-48 bg-card text-sm font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        renderItem={(user) => (
          <UserRow
            key={user.id}
            isActing={actionMutation.isPending}
            onAction={runAction}
            stores={stores}
            user={user}
          />
        )}
      />

      <PasswordResultDialog
        onOpenChange={(open) => {
          if (!open) setPasswordResult(null);
        }}
        result={passwordResult}
      />
    </AdminShell>
  );
}

function UserRow({
  isActing,
  onAction,
  stores,
  user,
}: {
  isActing: boolean;
  onAction: RunUserAction;
  stores: AdminConsoleStoreRow[];
  user: AdminPlatformUser;
}) {
  const [pendingRole, setPendingRole] = React.useState(user.role);

  React.useEffect(() => {
    setPendingRole(user.role);
  }, [user.role]);

  const linkedStoreIds = new Set([
    ...user.stores.map((store) => store.id),
    ...user.memberships.map((membership) => membership.store.id),
  ]);
  const availableStores = stores.filter((store) => !linkedStoreIds.has(store.id));

  return (
    <ExpandableListRow
      summary={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-foreground">{user.name}</p>
              <Badge className={`border ${roleTone(user.role)}`}>{user.role}</Badge>
              {user.email_confirmed_at ? (
                <Badge className="border border-success-surface-border bg-success-surface text-success-surface-foreground">
                  e-mail confirmado
                </Badge>
              ) : (
                <Badge className="border border-warning-surface-border bg-warning-surface text-warning-surface-foreground">
                  e-mail não confirmado
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              {user.email} ·{" "}
              {user.stores.length + user.memberships.length === 0
                ? "sem loja vinculada"
                : `${user.stores.length + user.memberships.length} loja(s) vinculada(s)`}
            </p>
          </div>
        </div>
      }
    >
      <DetailGrid>
        <DetailField label="ID">
          <span className="font-mono">{user.id}</span>
        </DetailField>
        <DetailField label="E-mail">{user.email}</DetailField>
        <DetailField label="Conta criada em">{formatDateTime(user.created_at)}</DetailField>
        <DetailField label="Atualizada em">{formatDateTime(user.updated_at)}</DetailField>
        <DetailField label="E-mail confirmado em">
          {user.email_confirmed_at ? formatDateTime(user.email_confirmed_at) : "Não confirmado"}
        </DetailField>
      </DetailGrid>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Select value={pendingRole} onValueChange={setPendingRole}>
          <SelectTrigger className="h-8 w-32 bg-card text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_ROLE_OPTIONS.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isActing || pendingRole === user.role}
          onClick={() => onAction({ action: "set_user_role", role: pendingRole, userId: user.id })}
        >
          Salvar papel
        </Button>

        {user.email_confirmed_at ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={isActing}
            onClick={() => onAction({ action: "set_user_email_confirmed", confirmed: false, userId: user.id })}
          >
            <MailX className="h-3.5 w-3.5" />
            Remover confirmação
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={isActing}
            onClick={() => onAction({ action: "set_user_email_confirmed", confirmed: true, userId: user.id })}
          >
            <MailCheck className="h-3.5 w-3.5" />
            Confirmar e-mail
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          disabled={isActing}
          onClick={() => {
            if (window.confirm(`Gerar uma nova senha para ${user.email}? A senha atual deixará de funcionar.`)) {
              onAction({ action: "reset_user_password", userId: user.id });
            }
          }}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Resetar senha
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-2xs font-black uppercase tracking-wide text-muted-foreground/70">
          Lojas vinculadas
        </p>
        <div className="mt-2 grid gap-2">
          {user.stores.map((store) => (
            <div
              key={`owner-${store.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2"
            >
              <span className="text-xs font-bold text-foreground/80">
                {store.name} <span className="font-medium text-muted-foreground">· dono</span>
              </span>
            </div>
          ))}
          {user.memberships.map((membership) => (
            <div
              key={membership.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2"
            >
              <span className="text-xs font-bold text-foreground/80">
                {membership.store.name}{" "}
                <span className="font-medium text-muted-foreground">· {membership.role}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-destructive-surface-border text-destructive hover:bg-destructive-surface hover:text-destructive"
                disabled={isActing}
                onClick={() => {
                  if (window.confirm(`Remover ${user.email} da loja ${membership.store.name}?`)) {
                    onAction({
                      action: "remove_user_from_store",
                      targetStoreId: membership.store.id,
                      userId: user.id,
                    });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            </div>
          ))}
          {user.stores.length + user.memberships.length === 0 ? (
            <p className="text-xs font-medium text-muted-foreground">Nenhuma loja vinculada.</p>
          ) : null}
        </div>

        <AddToStoreForm
          availableStores={availableStores}
          isActing={isActing}
          onAction={onAction}
          userId={user.id}
        />
      </div>
    </ExpandableListRow>
  );
}

function AddToStoreForm({
  availableStores,
  isActing,
  onAction,
  userId,
}: {
  availableStores: AdminConsoleStoreRow[];
  isActing: boolean;
  onAction: RunUserAction;
  userId: string;
}) {
  const [storeId, setStoreId] = React.useState("");
  const [role, setRole] = React.useState("admin");

  React.useEffect(() => {
    if (!availableStores.some((store) => store.id === storeId)) {
      setStoreId(availableStores[0]?.id ?? "");
    }
    // Only re-derive when the candidate list changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableStores]);

  if (availableStores.length === 0) {
    return (
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Este usuário já está vinculado a todas as lojas disponíveis.
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
      <Select value={storeId} onValueChange={setStoreId}>
        <SelectTrigger className="h-9 bg-card text-sm font-bold">
          <SelectValue placeholder="Selecione a loja" />
        </SelectTrigger>
        <SelectContent>
          {availableStores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-9 bg-card text-sm font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMBER_ROLE_OPTIONS.filter((option) => option !== "owner").map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-9 gap-1"
        disabled={isActing || !storeId}
        onClick={() => onAction({ action: "add_user_to_store", role, targetStoreId: storeId, userId })}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Adicionar
      </Button>
    </div>
  );
}

function PasswordResultDialog({
  onOpenChange,
  result,
}: {
  onOpenChange: (open: boolean) => void;
  result: { email: string; password: string } | null;
}) {
  const { toast } = useToast();

  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova senha gerada</DialogTitle>
          <DialogDescription>
            Esta senha só é exibida uma vez. Copie e repasse com segurança para{" "}
            {result?.email}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <code className="flex-1 select-all break-all text-sm font-bold text-foreground">
            {result?.password}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={async () => {
              if (!result) return;
              await navigator.clipboard.writeText(result.password);
              toast({ title: "Senha copiada" });
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluído</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

