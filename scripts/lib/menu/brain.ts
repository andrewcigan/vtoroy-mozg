// Экран «Мой мозг» (/mozg, «покажи мой мозг»): карточки vault по видам. Живёт в мосте, поэтому
// открывается сразу, когда Ива занята, и не тратит токены. Только показывает: меняет карточки
// сама Ива по словам владельца.
//
// Всё состояние — в номере страницы (навигационный верб pg), и номер считается из названия, а не
// из места в списке: кнопки старого сообщения ведут туда же и после рестарта, и после новых карточек.
//   0 — разделы; KIND + раздел*1000 + страница — список; CARD + карточка — карточка.
import {
  brainKinds,
  readBrain,
  stableId,
  type BrainCard,
} from "#lib/brain-cards.ts";
import { resolveVaultDir } from "../../../packages/vault-dir/index.ts";
import { sendBrainTableInBackground } from "../brain-table.ts";
import { button, buttonRow, escapeRichText } from "../telegram-buttons.ts";

const PER_PAGE = 6;
const STEP = 1000;
const KIND = 1_000_000_000_000;
const CARD = 1_000_000_000_000_000;
const KINDS_MAX = 24;
const KIND_LABEL_MAX = 24;
const TITLE_MAX = 80;
const WHY_MAX = 160;
const FROM_MAX = 40;
const FULL_MAX = 2200;

type Tr = (english: string, russian: string) => string;
type BrainState = { page?: number };
type BrainContext = { tr: Tr };
type TableContext = BrainContext & {
  deps: { reply?: (chatId: number, text: string) => unknown };
};

const short = (value: string, max: number): string => {
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
};
// Знаки, которые разметка Telegram съедает или превращает в ссылку, меняем на похожие.
const plain = (value: string): string =>
  value
    .replaceAll("<", "‹")
    .replaceAll(">", "›")
    .replaceAll("[", "(")
    .replaceAll("]", ")")
    .replaceAll("`", "'")
    .replaceAll("\\", "/");
const cut = (value: string, max: number): string =>
  escapeRichText(plain(short(value, max)));
// Подпись кнопки разметку не читает, экранировать её нельзя.
const label = (value: string): string => plain(short(value, KIND_LABEL_MAX));
const day = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/u.test(iso) ? iso.split("-").reverse().join(".") : iso;
const kindPage = (kind: string, page = 0): number =>
  KIND + stableId(kind) * STEP + page;
const open = (text: string, page: number) =>
  button(text, `iva_menu:br:pg:${page}`);

function root(cards: BrainCard[], T: Tr): string {
  const buttons = brainKinds(cards)
    .slice(0, KINDS_MAX)
    .map(({ kind, count }) => open(`${label(kind)} ${count}`, kindPage(kind)));
  const rows: string[] = [];
  for (let i = 0; i < buttons.length; i += 2)
    rows.push(buttonRow(buttons.slice(i, i + 2)));
  return [
    `# ${T(`🧠 My second brain · ${cards.length}`, `🧠 Мой второй мозг · ${cards.length}`)}`,
    ...(cards.length
      ? []
      : [
          T(
            "Empty so far: send a note, a voice message, a photo or forward a post.",
            "Пока пусто: пришли заметку, голосовое, фото или перешли пост.",
          ),
        ]),
    ...rows,
    button(T("📎 Excel table", "📎 Таблица Excel"), "iva_menu:br:xl"),
    button(T("✖ Close", "✖ Закрыть"), "iva_menu:br:x", "danger"),
  ].join("\n\n");
}

function list(kind: string, cards: BrainCard[], page: number, T: Tr): string {
  const mine = cards.filter((card) => card.kind === kind);
  const pages = Math.max(1, Math.ceil(mine.length / PER_PAGE));
  const now = Math.min(page, pages - 1);
  const shown = mine.slice(now * PER_PAGE, now * PER_PAGE + PER_PAGE);
  const rows = shown.map(
    (card, i) =>
      `**${now * PER_PAGE + i + 1}. ${cut(card.title, TITLE_MAX)}**\n${cut(card.why, WHY_MAX)} · ${cut(card.from, FROM_MAX)} · ${cut(day(card.date), FROM_MAX)}`,
  );
  const last = pages - 1;
  return [
    `# ${cut(kind, TITLE_MAX)} · ${mine.length}`,
    ...(rows.length ? rows : [T("Nothing here yet.", "Здесь пока ничего.")]),
    ...(shown.length
      ? [
          buttonRow(
            shown.map((card, i) =>
              open(`${now * PER_PAGE + i + 1}`, CARD + card.id),
            ),
          ),
        ]
      : []),
    ...(pages > 1
      ? [
          buttonRow([
            open("‹", kindPage(kind, Math.max(0, now - 1))),
            open(`${now + 1}/${pages}`, kindPage(kind, now)),
            open("›", kindPage(kind, Math.min(last, now + 1))),
          ]),
        ]
      : []),
    open(T("‹ Back", "‹ Назад"), 0),
  ].join("\n\n");
}

function one(card: BrainCard, cards: BrainCard[], T: Tr): string {
  const at = cards
    .filter((item) => item.kind === card.kind)
    .findIndex((item) => item.id === card.id);
  const page = Math.floor(at / PER_PAGE);
  return [
    `# ${cut(card.title, TITLE_MAX)}`,
    cut(card.full || card.why, FULL_MAX),
    `${cut(card.kind, TITLE_MAX)} · ${cut(card.from, FROM_MAX)} · ${cut(day(card.date), FROM_MAX)}`,
    T(
      "To change it, tell me in words: “fix…”, “remove…”.",
      "Изменить — словами: «исправь…», «убери…».",
    ),
    open(T("‹ Back", "‹ Назад"), kindPage(card.kind, page)),
  ].join("\n\n");
}

function screen(page: number, cards: BrainCard[], T: Tr): string {
  if (page >= CARD) {
    const card = cards.find((item) => item.id === page - CARD);
    return card ? one(card, cards, T) : root(cards, T);
  }
  if (page >= KIND) {
    const id = Math.floor((page - KIND) / STEP);
    const kind = brainKinds(cards).find((item) => stableId(item.kind) === id);
    if (kind) return list(kind.kind, cards, (page - KIND) % STEP, T);
  }
  return root(cards, T);
}

function sendTable(chatId: number, ctx: TableContext): true {
  sendBrainTableInBackground(chatId, () =>
    ctx.deps.reply?.(
      chatId,
      ctx.tr(
        "The table was not sent — try again in a minute.",
        "Таблица не ушла — попробуй ещё раз через минуту.",
      ),
    ),
  );
  return true;
}

export default {
  parent: "r",
  render(st: BrainState, ctx: BrainContext) {
    const cards = readBrain(resolveVaultDir(process.cwd()));
    return { text: screen(Math.max(0, st.page ?? 0), cards, ctx.tr) };
  },
  on(verb: string, _args: string[], st: { chatId: number }, ctx: TableContext) {
    if (verb === "xl") sendTable(st.chatId, ctx);
  },
  // Кнопка Excel в старом сообщении: состояние ей не нужно.
  recover(
    verb: string,
    _args: string[],
    event: { chatId: number },
    ctx: TableContext,
  ) {
    return verb === "xl" ? sendTable(event.chatId, ctx) : undefined;
  },
};
