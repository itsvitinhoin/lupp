import { describe, expect, it } from "vitest";
import { signNuvemshopState, verifyNuvemshopState } from "./state";

const SECRET = "spec-state-secret";

describe("nuvemshop oauth state", () => {
  it("round-trips a signed payload", () => {
    const payload = {
      iat: Math.floor(Date.now() / 1000),
      return_to: "https://luup.dzns.com.br/app/integrations",
      store_id: "store-1",
      user_id: "user-1",
    };
    const state = signNuvemshopState(payload, SECRET);
    expect(verifyNuvemshopState(state, SECRET)).toEqual(payload);
  });

  it("rejects a tampered payload", () => {
    const state = signNuvemshopState(
      { iat: Math.floor(Date.now() / 1000), store_id: "store-1", user_id: "user-1" },
      SECRET,
    );
    const [payload, signature] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ store_id: "attacker-store", user_id: "user-1" }),
    ).toString("base64url");
    expect(verifyNuvemshopState(`${forged}.${signature}`, SECRET)).toBeNull();
    expect(verifyNuvemshopState(`${payload}.${signature}`, "other-secret")).toBeNull();
  });

  it("rejects states older than the 30-minute TTL", () => {
    const state = signNuvemshopState(
      {
        iat: Math.floor(Date.now() / 1000) - 60 * 31,
        store_id: "store-1",
        user_id: "user-1",
      },
      SECRET,
    );
    expect(verifyNuvemshopState(state, SECRET)).toBeNull();
  });

  it("rejects malformed states and payloads missing ids", () => {
    expect(verifyNuvemshopState("not-a-state", SECRET)).toBeNull();
    expect(verifyNuvemshopState("a.b", SECRET)).toBeNull();
    const noIds = signNuvemshopState({ return_to: "https://x" }, SECRET);
    expect(verifyNuvemshopState(noIds, SECRET)).toBeNull();
  });
});
