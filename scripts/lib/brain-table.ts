// Выгрузка «Мой мозг» файлом Excel. Собирается в памяти и уходит в чат: на диске сервера
// временного файла с личными записями не остаётся.
import { readBrain } from "#lib/brain-cards.ts";
import { buildXlsx } from "#lib/xlsx.ts";
import { resolveVaultDir } from "../../packages/vault-dir/index.ts";

const TIMEOUT_MS = 60_000;

export type BrainTableResult = { ok: boolean; count: number; error?: string };

// Тот же исходящий гейт, что у сообщений: ключ, попавший в карточку, в файл не уходит. Импорт
// ленивый: сломанный гейт не мешает мосту стартовать, а таблица без него просто не отправится.
async function buildTable(): Promise<{ data: Buffer; count: number }> {
  const { scanOutbound } = await import("#lib/security-gate.ts");
  const safe = (value: string): string => scanOutbound(value).text;
  const cards = readBrain(resolveVaultDir(process.cwd()));
  const rows = cards.map((card) =>
    [card.kind, card.title, card.why, card.from, card.date].map(safe),
  );
  return {
    data: buildXlsx(["Вид", "Что", "Зачем", "Откуда", "Дата"], rows),
    count: cards.length,
  };
}

export async function sendBrainTable(
  chatId: number | string,
  {
    token = process.env.TELEGRAM_BOT_TOKEN ?? "",
    fetchImpl = fetch,
  }: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<BrainTableResult> {
  let count = 0;
  try {
    const table = await buildTable();
    count = table.count;
    const form = new FormData();
    form.append("chat_id", String(chatId));
    const day = new Date().toLocaleDateString("sv-SE", {
      timeZone: process.env.ASSISTANT_TIMEZONE || undefined,
    });
    form.append(
      "document",
      new File([new Uint8Array(table.data)], `Мой мозг ${day}.xlsx`),
    );
    const response = await fetchImpl(
      `https://api.telegram.org/bot${token}/sendDocument`,
      { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (response.ok) return { ok: true, count };
    return { ok: false, count, error: `Telegram ответил ${response.status}` };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      count,
      error: token ? text.replaceAll(token, "***") : text,
    };
  }
}

/** Отправить, не задерживая мост: он разбирает сообщения по одному, и /stop ждать не должен. */
export function sendBrainTableInBackground(
  chatId: number | string,
  onFail: (error: string) => unknown,
): void {
  void sendBrainTable(chatId).then((result) => {
    if (result.ok) return;
    const error = result.error ?? "?";
    console.error(`[brain] таблица не ушла: ${error}`);
    return onFail(error);
  });
}
