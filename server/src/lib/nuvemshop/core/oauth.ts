import { env } from "@/env";
import { BaseClient } from "./base";

export const NUVEMSHOP_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

export type NuvemshopTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  user_id?: number | string;
};

/** Falls back CLIENT_ID -> APP_ID (env defaults to the current app, 36726). */
export function nuvemshopAppId() {
  return env.NUVEMSHOP_CLIENT_ID || env.NUVEMSHOP_APP_ID;
}

/**
 * OAuth resource: authorize-URL building and code→token exchange. Needs no
 * access token or store id — construct it bare (`new OauthClient()`).
 */
export class OauthClient extends BaseClient {
  get endpoint() {
    return NUVEMSHOP_TOKEN_URL;
  }

  /** The portal-configured redirect URI is used by Nuvemshop; only `state` rides along. */
  authorizeUrl(state: string) {
    const url = new URL(
      `/apps/${nuvemshopAppId()}/authorize`,
      env.NUVEMSHOP_AUTHORIZE_BASE_URL,
    );
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeToken(code: string) {
    const result = await this.doRequest("POST", this.endpoint, {
      client_id: nuvemshopAppId(),
      client_secret: env.NUVEMSHOP_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });
    return { ...result, data: result.data as NuvemshopTokenResponse };
  }
}

/** Legacy-named wrapper kept for the routes that predate the client classes. */
export async function exchangeNuvemshopToken(code: string) {
  return new OauthClient().exchangeToken(code);
}
