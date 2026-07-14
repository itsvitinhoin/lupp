import { apiPost } from "@/lib/api";
import type {
  MasterConsoleAction,
  MasterConsoleSnapshot,
} from "@/types/master-console";

type MasterConsoleActionPayload = {
  current_trial_ends_at?: string | null;
  days?: number;
  plan_id?: string;
  store_id: string;
};

async function invokeMasterConsole<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const data = await apiPost<T>("/api/master-console", body);

  if (!data) throw new Error("Master Console não retornou dados.");
  return data;
}

export const masterConsoleService = {
  async getSnapshot() {
    return invokeMasterConsole<MasterConsoleSnapshot>({ action: "snapshot" });
  },

  async runAction(action: MasterConsoleAction, payload: MasterConsoleActionPayload) {
    return invokeMasterConsole<{ ok: boolean; result: Record<string, unknown> }>({
      action,
      ...payload,
    });
  },
};
