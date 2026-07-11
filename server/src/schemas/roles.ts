/**
 * Single source of truth for user roles. Exported as a plain tuple so each
 * handler can build `z.enum(ROLES)` with its own `z` import, and the
 * `verify-user-role` middleware / JWT augmentation can share the `Role` type.
 */
export const ROLES = ["admin", "manager", "agent"] as const

export type Role = (typeof ROLES)[number]
