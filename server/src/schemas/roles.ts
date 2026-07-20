/**
 * Single source of truth for user roles: the JWT augmentation
 * (`@types/fastify-jwt.d.ts`) and the sign-in handler derive the shared
 * `Role` type from this tuple.
 */
export const ROLES = ["admin", "manager", "agent"] as const

export type Role = (typeof ROLES)[number]
