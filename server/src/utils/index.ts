const NUMERIC_SEGMENT = /^\d+$/;
const LEADING_SLASH = /^\//;

export function formatFieldPath(instancePath: string): string {
  if (!instancePath || instancePath === "/") return "<root>";
  return instancePath
    .replace(LEADING_SLASH, "")
    .split("/")
    .map((seg, i) =>
      NUMERIC_SEGMENT.test(seg) ? `[${seg}]` : i === 0 ? seg : `.${seg}`,
    )
    .join("");
}

export function expectedDescriptor(
  keyword: string,
  params: Record<string, unknown>,
): string {
  if (typeof params.expected === "string") return params.expected;
  if (typeof params.format === "string") return params.format;
  return keyword;
}

export function stringifyInput(input: unknown): string {
  if (input === undefined) return "undefined";
  if (input === null) return "null";
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return String(input);
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
