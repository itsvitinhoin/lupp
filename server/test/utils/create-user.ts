import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";

export async function createUser(
  overrides: { name?: string; email?: string; role?: string } = {},
) {
  return prisma.user.create({
    data: {
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      password_hash: "not-a-real-hash",
      role: overrides.role ?? "agent",
    },
  });
}
