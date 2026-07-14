import { z } from "zod";

// The account shape auth endpoints may expose. password_hash must never leave
// the server — always query with this select, never a bare findUnique.
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatar_url: true,
  email_confirmed_at: true,
  created_at: true,
} as const;

export const PublicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  avatar_url: z.string().nullable(),
  email_confirmed_at: z.string().nullable().describe("ISO timestamp, null while unconfirmed."),
  created_at: z.string(),
});

type PublicUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  email_confirmed_at: Date | null;
  created_at: Date;
};

export function toPublicUser(user: PublicUserRow): z.infer<typeof PublicUserSchema> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
    email_confirmed_at: user.email_confirmed_at?.toISOString() ?? null,
    created_at: user.created_at.toISOString(),
  };
}
