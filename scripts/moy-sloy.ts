// Кладёт «мой слой» участника в установку: pravila.md → правила, navyki/*.md → навыки,
// obo-mne.md → vault/CORE.md (только пока там шаблон). Ключи не переносит. Сначала проверяет всё,
// потом пишет: наполовину поставленного слоя не бывает.
//
//   cd ~/iva && node scripts/moy-sloy.ts <папка>
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { dataDir } from "#lib/data-dir.ts";
import { parseFrontmatter } from "#lib/frontmatter.ts";
import { writeFileAtomicSync } from "#lib/fs-atomic.ts";
import { resolveVaultDir } from "../packages/vault-dir/index.ts";

const RULES_MAX = 2500; // вместе с правилами, которые Ива пишет сама, у них общий предел 4000
const CORE_MAX = 3600;
const SECRET =
  /sk-[A-Za-z0-9_-]{16,}|\b\d{8,10}:[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/u;

export type LayerPlace = { data: string; vault: string; template: string };
export type LayerResult = {
  errors: string[];
  notes: string[];
  written: string[];
};

function readPlain(file: string, errors: string[]): string | null {
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) {
    errors.push(`${basename(file)}: это ссылка или папка, нужен обычный файл`);
    return null;
  }
  const text = readFileSync(file, "utf8").trim();
  if (SECRET.test(text))
    errors.push(
      `${basename(file)}: внутри ключ или токен — ему место в klyuchi.env`,
    );
  return text || null;
}

function tooLong(
  name: string,
  text: string | null,
  max: number,
  errors: string[],
) {
  if (text && [...text].length > max)
    errors.push(`${name}: длиннее ${max} знаков — сократите`);
}

function readSkills(dir: string, errors: string[]): [string, string][] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .flatMap((name): [string, string][] => {
      if (!/^[a-z0-9][a-z0-9-]*\.md$/u.test(name)) {
        errors.push(`navyki/${name}: имя файла — латиница, цифры и дефис`);
        return [];
      }
      const text = readPlain(join(dir, name), errors);
      if (!text) return [];
      const description = parseFrontmatter(text).fields?.description;
      if (typeof description !== "string" || !description.trim())
        errors.push(`navyki/${name}: нет строки description в шапке`);
      return [[name, `${text}\n`]];
    });
}

// Файл о себе меняем, только пока там шаблон: накопленное Ивой дороже.
function coreIsTemplate(place: LayerPlace): boolean {
  const core = join(place.vault, "CORE.md");
  if (!existsSync(core)) return true;
  const now = readFileSync(core, "utf8");
  return ["CORE.md", "CORE.en.md"].some((name) => {
    const seed = join(place.template, name);
    return existsSync(seed) && readFileSync(seed, "utf8") === now;
  });
}

function write(file: string, text: string, written: string[]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomicSync(file, text);
  written.push(file);
}

export function installLayer(source: string, place: LayerPlace): LayerResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const written: string[] = [];
  const rules = readPlain(join(source, "pravila.md"), errors);
  const about = readPlain(join(source, "obo-mne.md"), errors);
  const skills = readSkills(join(source, "navyki"), errors);
  tooLong("pravila.md", rules, RULES_MAX, errors);
  tooLong("obo-mne.md", about, CORE_MAX, errors);
  if (!rules && !about && !skills.length && !errors.length)
    errors.push(
      "в папке нечего ставить: нужны pravila.md, obo-mne.md или navyki/*.md",
    );
  if (errors.length) return { errors, notes, written };
  if (rules)
    write(
      join(place.data, "custom/agent/instructions/moy-sloy.md"),
      `${rules}\n`,
      written,
    );
  for (const [name, text] of skills)
    write(join(place.data, "custom/agent/skills", name), text, written);
  if (about) {
    if (coreIsTemplate(place))
      write(join(place.vault, "CORE.md"), `${about}\n`, written);
    else if (
      readFileSync(join(place.vault, "CORE.md"), "utf8").trim() !== about
    )
      notes.push(
        "файл о себе не трогаю: Ива уже накопила в нём своё. Скажите ей словами, что изменить",
      );
  }
  return { errors, notes, written };
}

if (import.meta.main) {
  const source = process.argv[2];
  if (!source) {
    console.error("Как: node scripts/moy-sloy.ts <папка моего слоя>");
    process.exit(2);
  }
  const result = installLayer(source, {
    data: dataDir(),
    vault: resolveVaultDir(process.cwd()),
    template: join(process.cwd(), "vault-template"),
  });
  for (const line of result.errors) console.error(`✖ ${line}`);
  for (const line of result.notes) console.log(`• ${line}`);
  for (const file of result.written) console.log(`✓ ${file}`);
  process.exit(result.errors.length ? 1 : 0);
}
