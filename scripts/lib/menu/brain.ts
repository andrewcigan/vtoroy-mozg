// Экран «Мой мозг» (/mozg, «покажи мой мозг»): карточки vault по видам. Живёт в мосте, поэтому
// открывается сразу, когда Ива занята, и не тратит токены. Только показывает: меняет карточки
// сама Ива по словам владельца.
//
// Всё состояние — в номере страницы (навигационный верб pg), поэтому кнопки старого сообщения
// работают и после рестарта моста: 0 — разделы, (раздел+1)*1000 + страница — список раздела.
import { brainKinds, readBrain, type BrainCard } from "#lib/brain-cards.ts";
import { resolveVaultDir } from "../../../packages/vault-dir/index.ts";
import { sendBrainTable } from "../brain-table.ts";
import { button, buttonRow, escapeRichText } from "../telegram-buttons.ts";

const PER_PAGE = 6;
const STEP = 1000;
const TITLE_MAX = 80;
const WHY_MAX = 160;
const FROM_MAX = 40;

type Tr = (english: string, russian: string) => string;
type BrainState = { page?: number };
type BrainContext = { tr: Tr };
type TableContext = BrainContext & {
  deps: { reply?: (chatId: number, text: string) => unknown };
};

const cut = (value: string, max: number): string => {
  const chars = [...value];
  return escapeRichText(
    chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value,
  );
};
const day = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/u.test(iso) ? iso.split("-").reverse().join(".") : iso;

function root(cards: BrainCard[], T: Tr) {
  const buttons = brainKinds(cards).map(({ kind, count }, i) =>
    button(
      `${escapeRichText(kind)} ${count}`,
      `iva_menu:br:pg:${(i + 1) * STEP}`,
    ),
  );
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

function list(
  kind: string,
  at: number,
  cards: BrainCard[],
  page: number,
  T: Tr,
) {
  const mine = cards.filter((card) => card.kind === kind);
  const pages = Math.max(1, Math.ceil(mine.length / PER_PAGE));
  const now = Math.min(page, pages - 1);
  const rows = mine
    .slice(now * PER_PAGE, now * PER_PAGE + PER_PAGE)
    .map(
      (card) =>
        `**${cut(card.title, TITLE_MAX)}**\n${cut(card.why, WHY_MAX)} · ${cut(card.from, FROM_MAX)} · ${escapeRichText(day(card.date))}`,
    );
  const to = (n: number) => `iva_menu:br:pg:${at * STEP + n}`;
  return [
    `# ${cut(kind, TITLE_MAX)} · ${mine.length}`,
    ...(rows.length ? rows : [T("Nothing here yet.", "Здесь пока ничего.")]),
    ...(pages > 1
      ? [
          buttonRow([
            button("‹", to(Math.max(0, now - 1))),
            button(`${now + 1}/${pages}`, to(now)),
            button("›", to(Math.min(pages - 1, now + 1))),
          ]),
        ]
      : []),
    button(T("‹ Back", "‹ Назад"), "iva_menu:br:o"),
  ].join("\n\n");
}

export default {
  parent: "r",
  render(st: BrainState, ctx: BrainContext) {
    const cards = readBrain(resolveVaultDir(process.cwd()));
    const raw = Math.max(0, st.page ?? 0);
    const at = Math.floor(raw / STEP);
    const kind = brainKinds(cards)[at - 1]?.kind;
    if (kind === undefined) return { text: root(cards, ctx.tr) };
    return { text: list(kind, at, cards, raw % STEP, ctx.tr) };
  },
  async on(
    verb: string,
    _args: string[],
    st: { chatId: number },
    ctx: TableContext,
  ) {
    if (verb !== "xl") return;
    const result = await sendBrainTable(st.chatId);
    if (result.ok) return;
    console.error(`[brain] таблица не ушла: ${result.error ?? "?"}`);
    await ctx.deps.reply?.(
      st.chatId,
      ctx.tr(
        "The table was not sent — try again in a minute.",
        "Таблица не ушла — попробуй ещё раз через минуту.",
      ),
    );
  },
};
