// `iva tablica` — прислать второй мозг файлом Excel в чат владельца. Зовёт Ива, когда просьба
// сказана своими словами; обычные фразы и кнопку исполняет мост.
import { resolveVaultDir } from "../../packages/vault-dir/index.ts";
import { notificationChat } from "../../packages/notification-chat/index.ts";
import type { createCliRuntime } from "./runtime.ts";

type CliRuntime = ReturnType<typeof createCliRuntime>;

export function createTablicaCommand(
  root: string,
  runtime: Pick<CliRuntime, "ok" | "readEnv">,
  fetchImpl: typeof fetch = fetch,
) {
  return async (): Promise<void> => {
    const env = runtime.readEnv();
    const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
    const chat = notificationChat(env);
    if (!token || !chat)
      throw new Error("не задан токен бота или владелец — iva config");
    // Ленивый импорт: CLI обязан грузиться и без agent/ (ремонт, старые установки).
    const { sendBrainTable } = await import("../lib/brain-table.ts");
    const result = await sendBrainTable(chat, {
      token,
      fetchImpl,
      vault: resolveVaultDir(root, env.ASSISTANT_VAULT_DIR),
    });
    if (!result.ok) throw new Error(`таблица не ушла: ${result.error ?? "?"}`);
    runtime.ok(`таблица отправлена: карточек ${result.count}`);
  };
}
