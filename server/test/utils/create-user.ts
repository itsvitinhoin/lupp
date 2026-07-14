import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

export async function createUser(
  overrides: {
    name?: string;
    email?: string;
    role?: string;
    // When set, password_hash becomes a real bcrypt hash so the user can go
    // through POST /api/auth/sessions.
    password?: string;
    // Defaults to confirmed so fixtures can sign in; pass null for a user
    // still pending email confirmation.
    email_confirmed_at?: Date | null;
  } = {},
) {
  return prisma.user.create({
    data: {
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      password_hash: overrides.password
        ? bcrypt.hashSync(overrides.password, 6)
        : "not-a-real-hash",
      role: overrides.role ?? "agent",
      email_confirmed_at:
        overrides.email_confirmed_at === undefined
          ? new Date()
          : overrides.email_confirmed_at,
    },
  });
}
