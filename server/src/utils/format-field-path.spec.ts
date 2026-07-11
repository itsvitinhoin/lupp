import { describe, expect, it } from "vitest";
import { expectedDescriptor, formatFieldPath, stringifyInput } from "./index";

describe("formatFieldPath", () => {
  it("returns <root> for empty or root paths", () => {
    expect(formatFieldPath("")).toBe("<root>");
    expect(formatFieldPath("/")).toBe("<root>");
  });

  it("joins nested segments with dots and array indexes with brackets", () => {
    expect(formatFieldPath("/name")).toBe("name");
    expect(formatFieldPath("/items/0/sku")).toBe("items[0].sku");
  });
});

describe("expectedDescriptor", () => {
  it("prefers params.expected, then params.format, then the keyword", () => {
    expect(expectedDescriptor("type", { expected: "string" })).toBe("string");
    expect(expectedDescriptor("format", { format: "email" })).toBe("email");
    expect(expectedDescriptor("minLength", {})).toBe("minLength");
  });
});

describe("stringifyInput", () => {
  it("renders primitives, null/undefined, and JSON for objects", () => {
    expect(stringifyInput(undefined)).toBe("undefined");
    expect(stringifyInput(null)).toBe("null");
    expect(stringifyInput("abc")).toBe("abc");
    expect(stringifyInput(42)).toBe("42");
    expect(stringifyInput({ a: 1 })).toBe('{"a":1}');
  });
});
