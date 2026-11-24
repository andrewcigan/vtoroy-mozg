// Экран «Мой мозг»: что видит человек и куда ведут кнопки.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tempDir } from "../../fixtures/temp-dir.ts";
import brain from "./brain.ts";
import { sendBrainTable } from "../brain-table.ts";

function vaultWith(n: number, title = (i: number) => `Софт ${i}`) {
  const dir = tempDir("iva-brain-menu-");
  mkdirSync(join(dir, "cards/notes"), { recursive: true });
  for (let i = 0; i < n; i += 1)
    writeFileSync(
      join(dir, `cards/notes/${i}.md`),
      `---\ntype: "note"\ndescription: "Зачем ${i}."\ntags: ["вид:софт"]\nstatus: "active"\ncreated: "2026-11-24"\nsource: "канал «К»"\n---\n# ${title(i)}\n`,
    );
  return dir;
}
function view(page: number, vault: string) {
  process.env.ASSISTANT_VAULT_DIR = vault;
  return brain.render({ page }, { tr: (_e: string, r: string) => r }).text;
}

await test("корень: разделы с числом, Excel и закрыть", () => {
  const text = view(0, vaultWith(2));
  assert.match(text, /Мой второй мозг · 2/u);
  assert.match(text, />Софт и новости 2</u);
  assert.match(text, />Решения 0</u);
  assert.match(text, /iva_menu:br:xl/u);
  assert.match(text, /iva_menu:br:x[^l]/u);
});

await test("пустой мозг говорит, что делать", () => {
  assert.match(view(0, vaultWith(0)), /Пока пусто/u);
});

await test("раздел листается по 6, последняя страница неполная", () => {
  const dir = vaultWith(14);
  const at = /iva_menu:br:pg:(\d+)[^>]*>Софт и новости 14/u.exec(
    view(0, dir),
  )?.[1];
  assert.ok(at);
  const first = view(Number(at), dir);
  assert.equal(first.match(/^\*\*\d+\. /gmu)?.length, 6);
  assert.match(first, /1\/3/u);
  assert.equal(view(Number(at) + 2, dir).match(/^\*\*\d+\. /gmu)?.length, 2);
  assert.equal(view(Number(at) + 99, dir).match(/^\*\*\d+\. /gmu)?.length, 2);
  assert.match(first, /Зачем \d+\. · канал «К» · 24\.11\.2026/u);
});

await test("400 длинных названий помещаются в сообщение, разметка не ломается", () => {
  const dir = vaultWith(400, (i) => `${i} <b>**_x_**</b> ${"я".repeat(300)}`);
  const at = Number(
    /iva_menu:br:pg:(\d+)[^>]*>Софт и новости 400/u.exec(view(0, dir))?.[1],
  );
  const text = view(at, dir);
  assert.ok(text.length < 4096, String(text.length));
  assert.doesNotMatch(text, /(?<!\\)<b>/u);
});

await test("устаревший номер раздела возвращает в корень", () => {
  assert.match(view(1_000_000_000_999, vaultWith(1)), /Мой второй мозг/u);
});

await test("Excel уходит одним файлом в тот же чат, токена в ошибке нет", async () => {
  process.env.ASSISTANT_VAULT_DIR = vaultWith(3);
  const calls: { url: string; form: FormData }[] = [];
  const sent = await sendBrainTable(555, {
    token: "TT",
    fetchImpl: ((url: string, init: RequestInit) => {
      calls.push({ url, form: init.body as FormData });
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    }) as typeof fetch,
  });
  assert.equal(sent.ok, true);
  assert.match(calls[0].url, /\/sendDocument$/u);
  assert.equal(calls[0].form.get("chat_id"), "555");
  const file = calls[0].form.get("document") as File;
  assert.match(file.name, /^Мой мозг \d{4}-\d{2}-\d{2}\.xlsx$/u);
  assert.ok(file.size > 1000);
  const failed = await sendBrainTable(555, {
    token: "TT",
    fetchImpl: () => Promise.reject(new Error("net botTT/x")),
  });
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.error ?? "", /TT/u);
});

await test("номер открывает карточку целиком, назад ведёт в её раздел", () => {
  const dir = vaultWith(2);
  const at = Number(
    /iva_menu:br:pg:(\d+)[^>]*>Софт и новости 2/u.exec(view(0, dir))?.[1],
  );
  const card = /iva_menu:br:pg:(\d+)[^>]*>1</u.exec(view(at, dir))?.[1];
  const text = view(Number(card), dir);
  assert.match(text, /# Софт 0/u);
  assert.match(text, /Изменить — словами/u);
  assert.match(text, new RegExp(`iva_menu:br:pg:${at}[^>]*>‹ Назад`, "u"));
});

await test("старая кнопка раздела ведёт в тот же раздел после новых видов", () => {
  const dir = vaultWith(1);
  const note = (kind: string, name: string) => {
    writeFileSync(
      join(dir, `cards/notes/${name}.md`),
      `---\ntype: "note"\ntags: ["вид:${kind}"]\nstatus: "active"\ncreated: "2026-11-24"\n---\n# ${name}\n`,
    );
  };
  note("рецепты", "Борщ");
  const at = Number(
    /iva_menu:br:pg:(\d+)[^>]*>Рецепты 1/u.exec(view(0, dir))?.[1],
  );
  note("аптека", "Бинт");
  assert.match(view(at, dir), /# Рецепты/u);
});

await test("подпись кнопки без косых черт, угловые скобки видны", () => {
  const dir = vaultWith(1, () => "Vec<String> [x](http://y)");
  writeFileSync(
    join(dir, "cards/notes/t.md"),
    '---\ntype: "note"\ntags: ["вид:ai_tools"]\nstatus: "active"\ncreated: "2026-11-24"\n---\n# t\n',
  );
  assert.match(view(0, dir), />Ai_tools 1</u);
  const at = Number(
    /iva_menu:br:pg:(\d+)[^>]*>Софт и новости 1/u.exec(view(0, dir))?.[1],
  );
  assert.match(view(at, dir), /Vec‹String› \(x\)/u);
});

await test("ключ из карточки в Excel не уходит", async () => {
  process.env.ASSISTANT_VAULT_DIR = vaultWith(
    1,
    () =>
      "sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  let size = "";
  await sendBrainTable(1, {
    token: "T",
    fetchImpl: (async (_u: string, init: RequestInit) => {
      const file = (init.body as FormData).get("document") as File;
      const dir = tempDir("iva-brain-x-");
      writeFileSync(join(dir, "a.xlsx"), Buffer.from(await file.arrayBuffer()));
      size = spawnSync("python3", [
        "-c",
        "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('xl/worksheets/sheet1.xml').decode())",
        join(dir, "a.xlsx"),
      ]).stdout.toString();
      return new Response("{}");
    }) as typeof fetch,
  });
  assert.match(size, /Зачем 0/u);
  assert.doesNotMatch(size, /sk-or-v1-aaaa/u);
});

await test("на второй странице номера идут дальше, назад из карточки ведёт на неё же", () => {
  const dir = vaultWith(8);
  const at = Number(
    /iva_menu:br:pg:(\d+)[^>]*>Софт и новости 8/u.exec(view(0, dir))?.[1],
  );
  const second = view(at + 1, dir);
  assert.match(second, /^\*\*7\. /mu);
  const card = /iva_menu:br:pg:(\d+)[^>]*>7</u.exec(second)?.[1];
  assert.match(
    view(Number(card), dir),
    new RegExp(`iva_menu:br:pg:${at + 1}[^>]*>‹ Назад`, "u"),
  );
});
