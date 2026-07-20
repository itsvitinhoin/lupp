import { describe, expect, it } from "vitest";
import { MAX_BUFFERED, pushCapped, redactHeaderSecrets } from "./request-buffer";

describe("pushCapped", () => {
  it("drops the oldest entry once the buffer exceeds the cap", () => {
    const buffer: number[] = [];
    for (let i = 0; i < MAX_BUFFERED + 5; i++) pushCapped(buffer, i);
    expect(buffer).toHaveLength(MAX_BUFFERED);
    expect(buffer[0]).toBe(5);
    expect(buffer.at(-1)).toBe(MAX_BUFFERED + 4);
  });
});

describe("redactHeaderSecrets", () => {
  it("redacts bearer headers regardless of casing, keeps the rest", () => {
    expect(
      redactHeaderSecrets({
        Authorization: "Bearer secret",
        authentication: "bearer legacy-secret",
        "User-Agent": "Luup (suporte@luup.app)",
      }),
    ).toEqual({
      Authorization: "<redacted>",
      authentication: "<redacted>",
      "User-Agent": "Luup (suporte@luup.app)",
    });
  });
});
