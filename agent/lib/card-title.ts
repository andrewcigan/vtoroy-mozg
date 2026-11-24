// Название карточки — это её имя, и «исправь» меняет правду, а не имя. Но модель иногда кладёт в
// имя цену или процент, и после исправления рядом стоят «9,5%» и «9,25%». Правим только
// однозначное: одна величина с единицей ушла из правды, одна пришла.
const UNIT =
  "(?:%|процент|руб|р\\.|byn|usd|eur|€|\\$|₽|доллар|евро|тыс|млн|млрд)";
const AMOUNT = new RegExp(`(\\d+(?:[.,]\\d+)?)(?=\\s*${UNIT})`, "giu");

const amounts = (text: string): string[] => [
  ...new Set(
    [...text.matchAll(AMOUNT)].map((match) => match[1].replace(",", ".")),
  ),
];

export function freshTitle(
  title: string,
  before: string,
  after: string,
): string {
  const was = amounts(before);
  const now = amounts(after);
  const gone = amounts(title).filter(
    (value) => was.includes(value) && !now.includes(value),
  );
  const came = now.filter((value) => !was.includes(value));
  if (gone.length !== 1 || came.length !== 1) return title;
  const shown =
    [...after.matchAll(AMOUNT)]
      .map((match) => match[1])
      .find((value) => value.replace(",", ".") === came[0]) ?? came[0];
  return title.replace(AMOUNT, (value) =>
    value.replace(",", ".") === gone[0] ? shown : value,
  );
}
