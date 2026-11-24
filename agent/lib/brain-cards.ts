// Обзор второго мозга для человека: карточки vault одной строкой. Читают экран «Мой мозг»
// (scripts/lib/menu/brain.ts) и выгрузка Excel; модель здесь не участвует.
import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import {
  extractH1,
  listCardFiles,
  sectionRows,
  truthOf,
} from "./card-store.ts";
import { parseFrontmatterOrSkip, type FmFields } from "./frontmatter.ts";

export type BrainCard = {
  readonly kind: string;
  readonly title: string;
  readonly why: string;
  readonly from: string;
  readonly date: string;
  readonly status: string;
  /** Полный текст для карточки на экране: описание и записи Log. */
  readonly full: string;
  /** Устойчивый номер карточки: не зависит от порядка списка. */
  readonly id: number;
};

const BY_TYPE: Record<string, string> = {
  decision: "Решения",
  contact: "Люди",
  project: "Проекты",
  idea: "Идеи",
};
const BY_TAG: Record<string, string> = {
  софт: "Софт и новости",
  новости: "Софт и новости",
  посмотреть: "Посмотреть",
};
const MISC = "Разное";
const STANDARD = [
  "Решения",
  "Люди",
  "Проекты",
  "Идеи",
  "Софт и новости",
  "Посмотреть",
];
// «Убери» прячет карточку статусом (agent/instructions/35-vtoroy-mozg.md); superseded — правда,
// которую заменила другая карточка. Завершённое (done) остаётся видно.
const HIDDEN = new Set([
  "archived",
  "superseded",
  "inactive",
  "cancelled",
  "reverted",
]);

/** FNV-1a: короткий устойчивый номер для кнопок. */
export function stableId(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value.normalize("NFC")))
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

function tagKind(tags: unknown): string | null {
  const list = Array.isArray(tags) ? tags.map(String) : [];
  // write_card метки только добавляет, поэтому «это в рецепты» — последняя.
  const tag = list
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.startsWith("вид:"))
    .at(-1);
  const name = tag?.slice("вид:".length).trim() ?? "";
  if (!name) return null;
  return BY_TAG[name] ?? `${name[0].toUpperCase()}${name.slice(1)}`;
}

function firstSentence(value: string): string {
  return /^.*?[.!?…](?=\s|$)/u.exec(value)?.[0] ?? value;
}

// Указатель на дневник — внутренний адрес; для человека это его же слова.
function origin(source: string): string {
  return !source ||
    /daily\/\d{4}-/u.test(source) ||
    /^сообщение (?:пользователя|владельца)/iu.test(source)
    ? "вы"
    : source;
}

function toCard(
  fields: FmFields,
  title: string,
  path: string,
  body: string,
): BrainCard {
  const log = (sectionRows(body, "Log") ?? []).map((row) =>
    row
      .replace(/^- /u, "")
      .replace(/\s+·\s+(?:\[\[daily\/[^\]]+\]\].*|daily\/\S+)$/u, "")
      .trim(),
  );
  return {
    id: stableId(path),
    status: text(fields.status),
    full: [text(fields.description), truthOf(body), ...log]
      .filter(Boolean)
      .join("\n"),
    // Вид назвал владелец — он важнее типа: поставщик Игорь лежит в «Поставщиках», а не в «Людях».
    kind: tagKind(fields.tags) ?? BY_TYPE[text(fields.type)] ?? MISC,
    title,
    why: firstSentence(text(fields.description)) || "не указано",
    from: origin(text(fields.source)),
    date: text(fields.created),
  };
}

// Ночь сливает дубли: файл мог исчезнуть между списком и чтением. Другие сбои — наружу.
function readCard(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    console.error(`[brain] карточка исчезла, пропускаю: ${basename(file)}`);
    return null;
  }
}

/** Видимые карточки, свежие первыми. */
export function readBrain(vault: string): BrainCard[] {
  return listCardFiles(vault)
    .flatMap((file) => {
      const content = readCard(file);
      const parsed =
        content === null ? null : parseFrontmatterOrSkip(content, file);
      if (!parsed?.fields || HIDDEN.has(text(parsed.fields.status))) return [];
      return [
        toCard(
          parsed.fields,
          extractH1(parsed.body) ?? basename(file, ".md"),
          relative(vault, file),
          parsed.body,
        ),
      ];
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "ru"),
    );
}

/** Разделы: обычные всегда, свои виды по алфавиту, «Разное» — последним и только если есть. */
export function brainKinds(
  cards: readonly BrainCard[],
): { kind: string; count: number }[] {
  const count = (kind: string) =>
    cards.filter((card) => card.kind === kind).length;
  const own = [...new Set(cards.map((card) => card.kind))]
    .filter((kind) => !STANDARD.includes(kind) && kind !== MISC)
    .sort((a, b) => a.localeCompare(b, "ru"));
  return [...STANDARD, ...own, ...(count(MISC) ? [MISC] : [])].map((kind) => ({
    kind,
    count: count(kind),
  }));
}
