// «Мой слой» участника: правила, навыки и файл о себе ложатся в установку, чужое и секреты — нет.
import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tempDir } from "./fixtures/temp-dir.ts";
import { installLayer } from "./moy-sloy.ts";

function put(dir: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const TEMPLATE = "# CORE\n\nшаблон\n";
const SKILL = "---\ndescription: Use when новость.\n---\n# Н\n";
function place(core = TEMPLATE) {
  const root = put(tempDir("iva-sloy-"), {
    "vault/CORE.md": core,
    "vault-template/CORE.md": TEMPLATE,
    "vault-template/CORE.en.md": "# CORE\n",
  });
  return {
    data: join(root, "data"),
    vault: join(root, "vault"),
    template: join(root, "vault-template"),
  };
}
const layer = (files: Record<string, string>) =>
  put(tempDir("iva-sloy-src-"), files);

await test("правила, навык и файл о себе ложатся на места; повтор ничего не меняет", () => {
  const at = place();
  const src = layer({
    "pravila.md": "Отвечай коротко.",
    "obo-mne.md": "Я Марина.",
    "navyki/novost.md": SKILL,
    "klyuchi.env": "OPENROUTER_API_KEY=sk-or-v1-abcdefabcdefabcdef",
  });
  const first = installLayer(src, at);
  assert.deepEqual(first.errors, []);
  assert.equal(
    readFileSync(
      join(at.data, "custom/agent/instructions/moy-sloy.md"),
      "utf8",
    ).trim(),
    "Отвечай коротко.",
  );
  assert.equal(
    readFileSync(join(at.data, "custom/agent/skills/novost.md"), "utf8"),
    SKILL,
  );
  assert.equal(
    readFileSync(join(at.vault, "CORE.md"), "utf8").trim(),
    "Я Марина.",
  );
  assert.equal(existsSync(join(at.data, "custom/agent/klyuchi.env")), false);
  assert.deepEqual(installLayer(src, at).errors, []);
  assert.equal(
    readFileSync(join(at.vault, "CORE.md"), "utf8").trim(),
    "Я Марина.",
  );
});

await test("накопленный файл о себе не затираем и говорим об этом", () => {
  const at = place("# CORE\n\nИва узнала многое\n");
  const out = installLayer(layer({ "obo-mne.md": "Я Марина." }), at);
  assert.match(
    readFileSync(join(at.vault, "CORE.md"), "utf8"),
    /узнала многое/u,
  );
  assert.match(out.notes.join("\n"), /о себе/u);
});

for (const [name, files, want] of [
  [
    "ключ в правилах",
    { "pravila.md": "ключ sk-or-v1-abcdefabcdefabcdefabcdef" },
    /ключ/u,
  ],
  [
    "токен бота в навыке",
    {
      "navyki/a.md": `${SKILL}\n123456789:AAHabcdefghijklmnopqrstuvwxyz0123456`,
    },
    /ключ/u,
  ],
  [
    "ключ GitHub",
    { "pravila.md": "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    /ключ/u,
  ],
  [
    "незаполненный шаблон о себе",
    { "obo-mne.md": "- Имя: …" },
    /незаполненные/u,
  ],
  ["правила длиннее предела", { "pravila.md": "я".repeat(2501) }, /2500/u],
  ["о себе длиннее предела", { "obo-mne.md": "я".repeat(3601) }, /3600/u],
  ["навык без description", { "navyki/a.md": "# А\n" }, /description/u],
  ["имя навыка с пробелом", { "navyki/мой навык.md": SKILL }, /имя/u],
  ["пустая папка", { "chitay.txt": "" }, /нечего/u],
] as const)
  await test(`отказ: ${name} — ничего не записано`, () => {
    const at = place();
    const out = installLayer(layer(files), at);
    assert.match(out.errors.join("\n"), want);
    assert.equal(existsSync(join(at.data, "custom")), false);
    assert.equal(readFileSync(join(at.vault, "CORE.md"), "utf8"), TEMPLATE);
  });

await test("навык Ивы с тем же именем не затираем; свой прежний — обновляем", () => {
  const at = place();
  put(at.data, { "custom/agent/skills/novost.md": "навык Ивы" });
  const bad = installLayer(layer({ "navyki/novost.md": SKILL }), at);
  assert.match(bad.errors.join("\n"), /уже есть/u);
  assert.equal(
    readFileSync(join(at.data, "custom/agent/skills/novost.md"), "utf8"),
    "навык Ивы",
  );
  const clean = place();
  assert.deepEqual(
    installLayer(layer({ "navyki/novost.md": SKILL }), clean).errors,
    [],
  );
  assert.deepEqual(
    installLayer(layer({ "navyki/novost.md": `${SKILL}второе` }), clean).errors,
    [],
  );
  assert.match(
    readFileSync(join(clean.data, "custom/agent/skills/novost.md"), "utf8"),
    /второе/u,
  );
  put(clean.data, { "custom/agent/skills/novost.md": "изменила Ива" });
  assert.match(
    installLayer(layer({ "navyki/novost.md": SKILL }), clean).errors.join("\n"),
    /изменён/u,
  );
});

await test("ссылка на папку навыков — отказ", () => {
  const at = place();
  const src = layer({ "pravila.md": "а" });
  symlinkSync(layer({ "a.md": SKILL }), join(src, "navyki"));
  assert.match(installLayer(src, at).errors.join("\n"), /ссылка/u);
});

await test("ссылка наружу вместо файла — отказ", () => {
  const at = place();
  const src = layer({ "navyki/b.md": SKILL });
  symlinkSync("/etc/hosts", join(src, "pravila.md"));
  assert.match(installLayer(src, at).errors.join("\n"), /ссылк/u);
});
