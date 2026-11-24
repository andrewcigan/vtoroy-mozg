// Обзор второго мозга для человека: карточки vault одной строкой. Читают экран «Мой мозг»
// (scripts/lib/menu/brain.ts) и выгрузка Excel; модель здесь не участвует.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { extractH1, listCardFiles } from "./card-store.ts";
import { parseFrontmatterOrSkip, type FmFields } from "./frontmatter.ts";

export type BrainCard = {
  readonly kind: string;
  readonly title: string;
  readonly why: string;
  readonly from: string;
  readonly date: string;
};

const BY_TYPE: Record<string, string> = {
  decision: "Решения",
  contact: "Люди",
  project: "Проекты",
  idea: "Идеи",
};
const BY_TAG: Record<string, string> = {
  софт: "Софт и новости",
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
// «Убери» прячет карточку статусом: список тот же, что в agent/instructions/35-vtoroy-mozg.md.
const HIDDEN = new Set([
  "archived",
  "superseded",
  "inactive",
  "cancelled",
  "reverted",
  "done",
]);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

function tagKind(tags: unknown): string | null {
  const list = Array.isArray(tags) ? tags.map(String) : [];
  const tag = list
    .map((item) => item.trim().toLowerCase())
    .find((item) => item.startsWith("вид:"));
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

function toCard(fields: FmFields, title: string): BrainCard {
  return {
    kind: BY_TYPE[text(fields.type)] ?? tagKind(fields.tags) ?? MISC,
    title,
    why: firstSentence(text(fields.description)) || "не указано",
    from: origin(text(fields.source)),
    date: text(fields.created),
  };
}

/** Видимые карточки, свежие первыми. */
export function readBrain(vault: string): BrainCard[] {
  return listCardFiles(vault)
    .flatMap((file) => {
      const parsed = parseFrontmatterOrSkip(readFileSync(file, "utf8"), file);
      if (!parsed?.fields || HIDDEN.has(text(parsed.fields.status))) return [];
      return [
        toCard(parsed.fields, extractH1(parsed.body) ?? basename(file, ".md")),
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
