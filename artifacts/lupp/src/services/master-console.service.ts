import { requireSupabase } from "@/lib/supabase";
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
  const client = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) {
    throw new Error("Faça login novamente para acessar o Master Console.");
  }

  const { data, error } = await client.functions.invoke<T>("master-console", {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    if ("context" in error && error.context instanceof Response) {
      const details = await error.context.json().catch(() => null);
      if (details?.error) throw new Error(String(details.error).replace(/_/g, " "));
    }
    throw error;
  }

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
