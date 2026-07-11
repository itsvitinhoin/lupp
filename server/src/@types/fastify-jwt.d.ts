import "@fastify/jwt"
import type { Role } from "@/schemas/roles"

declare module "@fastify/jwt" {
  export interface FastifyJWT {
    user: {
      role: Role
      sub: string
    }
  }
}
