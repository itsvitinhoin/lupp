import { z } from "zod";

/**
 * LENIENT spec-only env (never throws): live-integration blocks are gated on
 * these being present via `describe.skipIf(!hasNuvemshopCredentials)`, so CI
 * (where they are empty) skips the network suites entirely.
 */
const TestEnvSchema = z.object({
  NUVEMSHOP_TEST_ACCESS_TOKEN: z.string().default(""),
  NUVEMSHOP_TEST_STORE_ID: z.string().default(""),
  NUVEMSHOP_USER_AGENT: z.string().default("Luup (suporte@luup.app)"),
});

export const testEnv = TestEnvSchema.parse(process.env);

export const hasNuvemshopCredentials = Boolean(
  testEnv.NUVEMSHOP_TEST_ACCESS_TOKEN && testEnv.NUVEMSHOP_TEST_STORE_ID,
);
