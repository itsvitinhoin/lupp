import { FastifyReply, FastifyRequest } from "fastify"
import { Role } from "@/schemas/roles"

// Hierarchy: a route requiring role X admits X and every role above it.
const allowedByTarget: Record<Role, Role[]> = {
  agent: ["agent", "manager", "admin"],
  manager: ["manager", "admin"],
  admin: ["admin"],
};

export function verifyUserRole(roleToVerify: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const allowed = allowedByTarget[roleToVerify];
    if (!allowed.includes(request.user.role)) {
      return reply.status(401).send({ message: "Unauthorized." })
    }
  }
}

