// Кладёт «мой слой» участника в установку: pravila.md → правила, navyki/*.md → навыки,
// obo-mne.md → vault/CORE.md (только пока там шаблон). Ключи не переносит. Сначала проверяет всё,
// потом пишет: наполовину поставленного слоя не бывает. Зовёт его `iva sloy <папка>`.
//
// Чужое не затираем: что положил слой, помнит data/moy-sloy.json. Файла с таким именем слой не
// клал, или его потом изменили (Ива или владелец) — отказ с понятной причиной.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { CORE_CAP } from "#lib/core-cap.ts";
import { parseFrontmatter } from "#lib/frontmatter.ts";
import { writeFileAtomicSync } from "#lib/fs-atomic.ts";
import { scanOutbound } from "#lib/security-gate.ts";

const RULES_MAX = 2500; // вместе с правилами, которые Ива пишет сама, у них общий предел 4000
const MANIFEST = "moy-sloy.json";
// Токен Telegram-бота и прочие ключи ловит исходящий гейт; эти формы — на случай, если гейт их не знает.
const SECRET =
  /ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{16,}|\b\d{8,10}:[A-Za-z0-9_-]{30,}/u;

const hasSecret = (text: string): boolean =>
  SECRET.test(text) || !scanOutbound(text).clean;
const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

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
  if (hasSecret(text))
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
  if (!lstatSync(dir).isDirectory()) {
    errors.push("navyki: это ссылка или файл, нужна обычная папка");
    return [];
  }
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

function readManifest(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
}

// Занят ли файл чужим содержимым: слой его не клал или его с тех пор изменили.
function foreign(
  file: string,
  key: string,
  next: string,
  manifest: Record<string, string>,
): boolean {
  if (!existsSync(file)) return false;
  const now = readFileSync(file, "utf8");
  return now !== next && manifest[key] !== hash(now);
}

type Planned = { key: string; file: string; text: string };

function plan(
  place: LayerPlace,
  rules: string | null,
  skills: [string, string][],
): Planned[] {
  const custom = join(place.data, "custom/agent");
  const files: [string, string][] = [
    ...(rules
      ? [["instructions/moy-sloy.md", `${rules}\n`] as [string, string]]
      : []),
    ...skills.map(([name, text]): [string, string] => [`skills/${name}`, text]),
  ];
  return files.map(([key, text]) => ({ key, file: join(custom, key), text }));
}

function write(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomicSync(file, text);
}

function checkAbout(about: string | null, errors: string[]) {
  if (about && /(^|\s)…\s*$/mu.test(about))
    errors.push(
      "obo-mne.md: остались незаполненные строки с «…» — заполните или уберите",
    );
}

function writeAbout(place: LayerPlace, about: string, result: LayerResult) {
  const core = join(place.vault, "CORE.md");
  if (coreIsTemplate(place)) {
    write(core, `${about}\n`);
    result.written.push(core);
  } else if (readFileSync(core, "utf8").trim() !== about)
    result.notes.push(
      "файл о себе не трогаю: в нём уже не шаблон. Скажите Иве словами, что изменить",
    );
}

export function installLayer(source: string, place: LayerPlace): LayerResult {
  const result: LayerResult = { errors: [], notes: [], written: [] };
  const { errors } = result;
  const rules = readPlain(join(source, "pravila.md"), errors);
  const about = readPlain(join(source, "obo-mne.md"), errors);
  const skills = readSkills(join(source, "navyki"), errors);
  tooLong("pravila.md", rules, RULES_MAX, errors);
  tooLong("obo-mne.md", about, CORE_CAP, errors);
  checkAbout(about, errors);
  if (!rules && !about && !skills.length && !errors.length)
    errors.push(
      "в папке нечего ставить: нужны pravila.md, obo-mne.md или navyki/*.md",
    );
  const manifestFile = join(place.data, MANIFEST);
  const manifest = readManifest(manifestFile);
  const planned = plan(place, rules, skills);
  for (const { key, file, text } of planned)
    if (foreign(file, key, text, manifest))
      errors.push(
        `${basename(file)}: такой файл у Ивы уже есть, и он не из слоя или изменён — назовите свой иначе`,
      );
  if (errors.length) return result;
  for (const { key, file, text } of planned) {
    write(file, text);
    manifest[key] = hash(text);
    result.written.push(file);
  }
  if (planned.length)
    write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  if (about) writeAbout(place, about, result);
  return result;
}
