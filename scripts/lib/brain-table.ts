// Выгрузка «Мой мозг» файлом Excel. Собирается в памяти и уходит в чат: на диске сервера
// временного файла с личными записями не остаётся.
import { readBrain } from "#lib/brain-cards.ts";
import { buildXlsx } from "#lib/xlsx.ts";
import { resolveVaultDir } from "../../packages/vault-dir/index.ts";

const TIMEOUT_MS = 60_000;

export type BrainTableResult = { ok: boolean; count: number; error?: string };

export async function sendBrainTable(
  chatId: number | string,
  {
    token = process.env.TELEGRAM_BOT_TOKEN ?? "",
    fetchImpl = fetch,
  }: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<BrainTableResult> {
  const cards = readBrain(resolveVaultDir(process.cwd()));
  const data = buildXlsx(
    ["Вид", "Что", "Зачем", "Откуда", "Дата"],
    cards.map((card) => [
      card.kind,
      card.title,
      card.why,
      card.from,
      card.date,
    ]),
  );
  const form = new FormData();
  form.append("chat_id", String(chatId));
  const day = new Date().toLocaleDateString("sv-SE", {
    timeZone: process.env.ASSISTANT_TIMEZONE || undefined,
  });
  form.append(
    "document",
    new File([new Uint8Array(data)], `Мой мозг ${day}.xlsx`),
  );
  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${token}/sendDocument`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (response.ok) return { ok: true, count: cards.length };
    return {
      ok: false,
      count: cards.length,
      error: `Telegram ответил ${response.status}`,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      count: cards.length,
      error: token ? text.replaceAll(token, "***") : text,
    };
  }
}
