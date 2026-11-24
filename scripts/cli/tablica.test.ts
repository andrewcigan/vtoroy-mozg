// `iva tablica`: файл уходит владельцу, без токена — понятный отказ.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../fixtures/temp-dir.ts";
import { createTablicaCommand } from "./tablica.ts";

await test("файл уходит владельцу из его каталога памяти", async () => {
  const root = tempDir("iva-tablica-");
  mkdirSync(join(root, "svoy/cards/notes"), { recursive: true });
  writeFileSync(
    join(root, "svoy/cards/notes/a.md"),
    '---\ntype: "note"\nstatus: "active"\ncreated: "2026-11-24"\n---\n# А\n',
  );
  const said: string[] = [];
  let chat = "";
  const run = createTablicaCommand(
    root,
    {
      ok: (line: string) => {
        said.push(line);
      },
      readEnv: () => ({
        TELEGRAM_BOT_TOKEN: "T",
        TELEGRAM_ALLOWED_USER_IDS: "555",
        ASSISTANT_VAULT_DIR: "svoy",
      }),
    },
    ((_url: string, init: RequestInit) => {
      const value = (init.body as FormData).get("chat_id");
      chat = typeof value === "string" ? value : "";
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch,
  );
  await run();
  assert.equal(chat, "555");
  assert.match(said[0] ?? "", /карточек 1/u);
});

await test("нет токена — понятный отказ", async () => {
  const run = createTablicaCommand(tempDir("iva-tablica-no-"), {
    ok: () => undefined,
    readEnv: () => ({}),
  });
  await assert.rejects(run(), /токен/u);
});
