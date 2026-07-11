import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Boot-safety behavior: production must refuse to start with the publicly
// known placeholder secret. Each test sets every relevant key explicitly —
// dotenv (imported by env.ts) never overrides keys already present in
// process.env, so the local .env file can't leak into these cases.
const ORIGINAL_ENV = process.env;

describe("env schema (production placeholder rejection)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("boots with a real secret in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-real-production-secret";

    const { env } = await import("./env");

    expect(env.NODE_ENV).toBe("production");
    expect(env.JWT_SECRET).toBe("a-real-production-secret");
  });

  it("refuses to boot in production with the placeholder JWT_SECRET", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "lupp-server-jwt-secret";

    await expect(import("./env")).rejects.toThrow("Invalid environment variables.");
  });

  it("allows the placeholder outside production (dev default)", async () => {
    process.env.NODE_ENV = "dev";
    process.env.JWT_SECRET = "lupp-server-jwt-secret";

    const { env } = await import("./env");

    expect(env.JWT_SECRET).toBe("lupp-server-jwt-secret");
  });

  it("applies the documented defaults", async () => {
    process.env.NODE_ENV = "dev";
    delete process.env.PORT;
    delete process.env.DATABASE_POOL_MAX;

    const { env } = await import("./env");

    expect(env.PORT).toBe(3333);
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });
});
