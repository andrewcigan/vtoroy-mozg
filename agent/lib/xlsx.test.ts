// Файл Excel без библиотек: проверяем чтением настоящим распаковщиком, а не своим же кодом.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildXlsx } from "./xlsx.ts";

const READ = `
import sys, zipfile, re, json
from xml.etree import ElementTree as E
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
for n in z.namelist():
    if n.endswith((".xml", ".rels")): E.fromstring(z.read(n))
s = E.fromstring(z.read("xl/worksheets/sheet1.xml")); ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
rows = [["".join(t.text or "" for t in c.iter(ns + "t")) for c in r.iter(ns + "c")] for r in s.iter(ns + "row")]
f = [c.tag for c in s.iter(ns + "f")]
print(json.dumps({"rows": rows, "formulas": len(f), "filter": s.find(ns + "autoFilter") is not None}))
`;
function open(t: { after(fn: () => void): void }, data: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), "iva-xlsx-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, "a.xlsx"), data);
  const r = spawnSync("python3", ["-c", READ, join(dir, "a.xlsx")], {
    maxBuffer: 1 << 27,
  });
  assert.equal(r.status, 0, r.stderr.toString());
  return JSON.parse(r.stdout.toString()) as {
    rows: string[][];
    formulas: number;
    filter: boolean;
  };
}

await test("кириллица, кавычки и разметка доезжают дословно, есть фильтр", (t) => {
  const got = open(
    t,
    buildXlsx(
      ["Вид", "Что"],
      [
        ["Софт", '«A» <b> & "c"'],
        ["Люди", "Марина"],
      ],
    ),
  );
  assert.deepEqual(got.rows, [
    ["Вид", "Что"],
    ["Софт", '«A» <b> & "c"'],
    ["Люди", "Марина"],
  ]);
  assert.equal(got.filter, true);
});

await test("ячейка, похожая на формулу, остаётся текстом", (t) => {
  const got = open(
    t,
    buildXlsx(["a"], [['=HYPERLINK("http://x")'], ["+7"], ["-1"], ["@x"]]),
  );
  assert.equal(got.formulas, 0);
  assert.equal(got.rows[1]?.[0], '=HYPERLINK("http://x")');
});

await test("управляющие символы и одинокие суррогаты не ломают файл; пустая таблица открывается", (t) => {
  assert.deepEqual(
    open(t, buildXlsx(["a"], [["x\u0000\u0008y\uD800"]])).rows[1],
    ["xy"],
  );
  assert.deepEqual(open(t, buildXlsx(["a", "b"], [])).rows, [["a", "b"]]);
});

await test("400 строк и длинная ячейка", (t) => {
  const got = open(
    t,
    buildXlsx(
      ["a"],
      Array.from({ length: 400 }, (_, i) => [`${i} ${"я".repeat(40_000)}`]),
    ),
  );
  assert.equal(got.rows.length, 401);
  assert.ok((got.rows[1]?.[0]?.length ?? 0) <= 32_767);
});
