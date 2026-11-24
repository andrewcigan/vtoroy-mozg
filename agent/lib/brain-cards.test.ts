// Обзор «Мой мозг»: что показываем из карточек. Карточки — дословно с прогона 24.11.2026.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brainKinds, readBrain } from "./brain-cards.ts";

function vault(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "iva-brain-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const card = (fm: string, title: string, log = "") =>
  `---\n${fm}\n---\n# ${title}\n\n## Log\n\n${log}\n\n## Related\n\n## History\n`;

const GRANOLA = card(
  'type: "note"\ndescription: "Инструмент для записи и разбора встреч без бота в звонке. Ещё текст."\ntags: ["AI","вид:софт"]\nstatus: "active"\ncreated: "2026-11-24"\nsource: "канал «Новости нейронок»"',
  "Granola 3 — AI-заметки встреч",
);
const KP = card(
  'type: "decision"\ndescription: "Решили с Олей делать КП самостоятельно."\ntags: []\nstatus: "active"\ncreated: "2026-11-23"\nsource: "daily/2026-11-23.md"',
  "Коммерческое предложение делаем сами",
);

await test("строка: вид, что, зачем одним предложением, откуда, дата", (t) => {
  const dir = vault({
    "cards/notes/g.md": GRANOLA,
    "cards/decisions/kp.md": KP,
  });
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  assert.deepEqual(
    readBrain(dir).map(({ kind, title, why, from, date }) => ({
      kind,
      title,
      why,
      from,
      date,
    })),
    [
      {
        kind: "Софт и новости",
        title: "Granola 3 — AI-заметки встреч",
        why: "Инструмент для записи и разбора встреч без бота в звонке.",
        from: "канал «Новости нейронок»",
        date: "2026-11-24",
      },
      {
        kind: "Решения",
        title: "Коммерческое предложение делаем сами",
        why: "Решили с Олей делать КП самостоятельно.",
        from: "вы",
        date: "2026-11-23",
      },
    ],
  );
});

await test("убранное и устаревшее не показываем", (t) => {
  const s = (status: string) =>
    card(
      `type: "note"\ndescription: "а"\ntags: ["вид:посмотреть"]\nstatus: "${status}"\ncreated: "2026-11-24"`,
      status,
    );
  const dir = vault(
    Object.fromEntries(
      [
        "active",
        "archived",
        "superseded",
        "inactive",
        "cancelled",
        "reverted",
        "done",
        "draft",
        "paused",
      ].map((x) => [`cards/notes/${x}.md`, s(x)]),
    ),
  );
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  assert.deepEqual(
    readBrain(dir)
      .map((c) => c.title)
      .sort(),
    ["active", "done", "draft", "paused"],
  );
});

await test("свой вид участника становится разделом, без метки — «Разное»", (t) => {
  const dir = vault({
    "cards/notes/a.md": card(
      'type: "note"\ndescription: "Борщ"\ntags: ["вид:рецепты"]\nstatus: "active"\ncreated: "2026-11-24"',
      "Борщ",
    ),
    "cards/notes/b.md": card(
      'type: "note"\ntags: []\nstatus: "active"\ncreated: "2026-11-20"',
      "Без всего",
    ),
  });
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const cards = readBrain(dir);
  assert.deepEqual(
    cards.map((c) => [c.kind, c.why]),
    [
      ["Рецепты", "Борщ"],
      ["Разное", "не указано"],
    ],
  );
  assert.deepEqual(brainKinds(cards), [
    { kind: "Решения", count: 0 },
    { kind: "Люди", count: 0 },
    { kind: "Проекты", count: 0 },
    { kind: "Идеи", count: 0 },
    { kind: "Софт и новости", count: 0 },
    { kind: "Посмотреть", count: 0 },
    { kind: "Рецепты", count: 1 },
    { kind: "Разное", count: 1 },
  ]);
});

await test("пустой мозг и битая карточка не роняют обзор", (t) => {
  const dir = vault({ "cards/notes/bad.md": '---\ntype: "note\n---\n# x' });
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  t.mock.method(console, "error", () => undefined);
  assert.deepEqual(readBrain(join(dir, "нет")), []);
  assert.ok(Array.isArray(readBrain(dir)));
});
