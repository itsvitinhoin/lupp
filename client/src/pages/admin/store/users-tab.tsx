import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import type { AdminStoreDetail } from "@/types/admin-console";
import { KeyRound, MailCheck, Trash2, UserPlus } from "lucide-react";
import { formatDate } from "../shared";
import { MEMBER_ROLE_OPTIONS, RunAdminAction } from "./shared";

export function UsersTab({
  detail,
  isActing,
  onAction,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onAction: RunAdminAction;
}) {
  // The owner always appears, even without a store_members row (legacy data).
  const ownerMembership = detail.members.find(
    (member) => member.user.id === detail.owner.id,
  );
  const rows = [
    {
      isOwner: true,
      membershipId: ownerMembership?.id ?? null,
      role: ownerMembership?.role ?? "owner",
      user: detail.owner,
    },
    ...detail.members
      .filter((member) => member.user.id !== detail.owner.id)
      .map((member) => ({
        isOwner: false,
        membershipId: member.id,
        role: member.role,
        user: member.user,
      })),
  ];

  return (
    <SectionCard
      title="Usuários da loja"
      description="Papéis, acesso e ações de suporte à conta (auditadas)."
      contentClassName="gap-4"
    >
      {rows.map((row) => (
        <StoreUserRow
          key={row.user.id}
          isActing={isActing}
          isOwner={row.isOwner}
          membershipId={row.membershipId}
          onAction={onAction}
          role={row.role}
          user={row.user}
        />
      ))}
      <AddMemberForm isActing={isActing} onAction={onAction} />
    </SectionCard>
  );
}

function StoreUserRow({
  isActing,
  isOwner,
  membershipId,
  onAction,
  role,
  user,
}: {
  isActing: boolean;
  isOwner: boolean;
  membershipId: string | null;
  onAction: RunAdminAction;
  role: string;
  user: AdminStoreDetail["owner"];
}) {
  const [pendingRole, setPendingRole] = React.useState(role);

  React.useEffect(() => {
    setPendingRole(role);
  }, [role]);

  return (
    <ListItem variant="panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-foreground">{user.name}</p>
            {isOwner ? (
              <Badge className="border border-info-surface-border bg-info-surface text-info-surface-foreground">
                dono
              </Badge>
            ) : null}
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
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {user.email} · conta criada em {formatDate(user.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {membershipId ? (
            <>
              <Select value={pendingRole} onValueChange={setPendingRole}>
                <SelectTrigger className="h-8 w-32 bg-card text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={isActing || pendingRole === role}
                onClick={() =>
                  onAction({
                    action: "set_member_role",
                    memberId: membershipId,
                    role: pendingRole,
                  })
                }
              >
                Salvar papel
              </Button>
            </>
          ) : null}
          {!user.email_confirmed_at ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={isActing}
              onClick={() =>
                onAction({ action: "confirm_user_email", userId: user.id })
              }
            >
              <MailCheck className="h-3.5 w-3.5" />
              Confirmar e-mail
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={isActing}
            onClick={() =>
              onAction({ action: "send_password_reset", userId: user.id })
            }
          >
            <KeyRound className="h-3.5 w-3.5" />
            Reset de senha
          </Button>
          {!isOwner && membershipId ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-destructive-surface-border text-destructive hover:bg-destructive-surface hover:text-destructive"
              disabled={isActing}
              onClick={() => {
                if (window.confirm(`Remover ${user.email} desta loja?`)) {
                  onAction({ action: "remove_member", memberId: membershipId });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          ) : null}
        </div>
      </div>
    </ListItem>
  );
}

function AddMemberForm({
  isActing,
  onAction,
}: {
  isActing: boolean;
  onAction: RunAdminAction;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("admin");

  return (
    <div className="mt-2 rounded-xl border border-dashed border-input p-4">
      <p className="text-sm font-bold text-foreground/80">Adicionar membro</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        O e-mail precisa pertencer a uma conta Luup existente.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <Input
          placeholder="email@exemplo.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="bg-card text-sm font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLE_OPTIONS.filter((option) => option !== "owner").map(
              (option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button
          className="gap-2"
          disabled={isActing || !email.trim()}
          onClick={() => {
            onAction({ action: "add_member", email: email.trim(), role });
            setEmail("");
          }}
        >
          <UserPlus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
