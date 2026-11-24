// `iva sloy`: каталоги берутся из .env установки, отказ виден и ничего не пишет.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../fixtures/temp-dir.ts";
import { createSloyCommand } from "./sloy.ts";

function stand() {
  const root = tempDir("iva-sloy-cli-");
  const source = tempDir("iva-sloy-cli-src-");
  for (const dir of ["vault-template", "svoy-vault"])
    mkdirSync(join(root, dir), { recursive: true });
  for (const dir of ["vault-template", "svoy-vault"])
    writeFileSync(join(root, dir, "CORE.md"), "# CORE\n");
  const seen: string[] = [];
  const run = createSloyCommand(root, {
    ok: (line: string) => {
      seen.push(line);
    },
    dataDirAbs: () => join(root, "svoi-dannye"),
    readEnv: () => ({ ASSISTANT_VAULT_DIR: "svoy-vault" }),
  });
  return { root, source, seen, run };
}

await test("слой ложится в каталоги из .env", async () => {
  const { root, source, seen, run } = stand();
  writeFileSync(join(source, "pravila.md"), "Коротко.");
  writeFileSync(join(source, "obo-mne.md"), "Я Марина.");
  await run([source]);
  assert.ok(
    existsSync(join(root, "svoi-dannye/custom/agent/instructions/moy-sloy.md")),
  );
  assert.equal(
    readFileSync(join(root, "svoy-vault/CORE.md"), "utf8").trim(),
    "Я Марина.",
  );
  assert.equal(seen.length, 2);
});

await test("без папки и с отказом — ошибка, ничего не записано", async () => {
  const { root, source, run } = stand();
  await assert.rejects(run([]), /usage/u);
  await assert.rejects(run([source]), /нечего/u);
  assert.equal(existsSync(join(root, "svoi-dannye")), false);
});
