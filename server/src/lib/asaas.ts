import { env } from "@/env";

/**
 * Thin Asaas API client shared by the ported asaas-* edge functions. It only
 * builds URLs/headers and surfaces errors the way the originals did (the
 * first `errors[].description`, then `message`, then a generic code) — all
 * payload shaping stays in the handlers.
 */

export function asaasApiBase() {
  return env.ASAAS_ENVIRONMENT === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

// Hosted checkout page (asaas-create-checkout builds the redirect URL).
export function asaasCheckoutBaseUrl() {
  return env.ASAAS_ENVIRONMENT === "sandbox"
    ? "https://sandbox.asaas.com/checkoutSession/show"
    : "https://asaas.com/checkoutSession/show";
}

export async function readAsaasError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    errors?: Array<{ description?: unknown }>;
    message?: unknown;
  } | null;
  if (body && Array.isArray(body.errors) && body.errors[0]?.description) {
    return String(body.errors[0].description);
  }
  if (body && typeof body.message === "string") return body.message;
  return "asaas_request_failed";
}

/** Raw call — the caller inspects response.ok/status (asaas-create-checkout). */
export async function asaasFetch(
  path: string,
  payload: Record<string, unknown>,
  method: "POST" | "PUT" = "POST",
) {
  return fetch(`${asaasApiBase()}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY ?? "",
    },
    method,
  });
}

/** JSON call that throws Error(<asaas error message>) on non-2xx, like the originals. */
export async function asaasRequest<T>(
  path: string,
  payload: Record<string, unknown>,
  method: "POST" | "PUT" = "POST",
) {
  const response = await asaasFetch(path, payload, method);

  if (!response.ok) {
    throw new Error(await readAsaasError(response));
  }

  return (await response.json()) as T;
}

export async function deleteAsaasSubscription(providerSubscriptionId: string) {
  const response = await fetch(
    `${asaasApiBase()}/subscriptions/${providerSubscriptionId}`,
    {
      headers: { access_token: env.ASAAS_API_KEY ?? "" },
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readAsaasError(response));
  }

  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}
