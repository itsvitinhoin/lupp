import type { TableRow } from "./database";

export type LuppStore = TableRow<"stores">;

export interface CreateStorePayload {
  name: string;
  slug?: string;
  url?: string;
  platform: string;
  segment: string;
  ownerId: string;
}
