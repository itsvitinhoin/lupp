import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@/schemas/roles";
import { verifyUserRole } from "./verify-user-role";

// The full hierarchy matrix in one place: a route requiring role X admits X
// and every role above it (agent ⊂ manager ⊂ admin); denials are 401 per the
// project convention (the client treats 401 as session-expiry).
async function run(target: Role, actual: Role) {
  const send = vi.fn();
  const status = vi.fn((_code: number) => ({ send }));
  const request = { user: { role: actual } } as unknown as FastifyRequest;
  const reply = { status } as unknown as FastifyReply;

  await verifyUserRole(target)(request, reply);

  return {
    denied: status.mock.calls.length > 0,
    statusCode: status.mock.calls[0]?.[0],
  };
}

describe("verifyUserRole hierarchy", () => {
  const MATRIX: Array<{ target: Role; actual: Role; allowed: boolean }> = [
    { target: "agent", actual: "agent", allowed: true },
    { target: "agent", actual: "manager", allowed: true },
    { target: "agent", actual: "admin", allowed: true },
    { target: "manager", actual: "agent", allowed: false },
    { target: "manager", actual: "manager", allowed: true },
    { target: "manager", actual: "admin", allowed: true },
    { target: "admin", actual: "agent", allowed: false },
    { target: "admin", actual: "manager", allowed: false },
    { target: "admin", actual: "admin", allowed: true },
  ];

  it.each(MATRIX)(
    "route requiring $target: $actual → allowed=$allowed",
    async ({ target, actual, allowed }) => {
      const result = await run(target, actual);

      expect(result.denied).toBe(!allowed);
      if (!allowed) expect(result.statusCode).toBe(401);
    },
  );

  it("denies an unknown role value with 401", async () => {
    const result = await run("admin", "superuser" as Role);

    expect(result.denied).toBe(true);
    expect(result.statusCode).toBe(401);
  });
});

