// Просьбы словами, которые исполняет мост: целое сообщение владельца в личке, не пересылка.
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { phraseCommand } from "./control.ts";

const mine = { forwarded: false, privateChat: true };

await test("слова открывают мозг и таблицу", () => {
  assert.equal(phraseCommand("Покажи мой мозг", mine), "/mozg");
  assert.equal(phraseCommand("  покажи  мой мозг!  ", mine), "/mozg");
  assert.equal(phraseCommand("Пришли мозг таблицей.", mine), "/tablica");
});

await test("пересылка, группа, часть фразы, ответ на вопрос Ивы — не команда", () => {
  assert.equal(
    phraseCommand("покажи мой мозг", { ...mine, forwarded: true }),
    null,
  );
  assert.equal(
    phraseCommand("покажи мой мозг", { ...mine, privateChat: false }),
    null,
  );
  for (const text of [
    "покажи мой мозг Марине",
    "пришли таблицу",
    "пришли таблицей",
    "constructor",
    "",
  ])
    assert.equal(phraseCommand(text, mine), null);
});

await test("любой другой текст не перехватывается (seed 20261124)", () => {
  fc.assert(
    fc.property(fc.string({ unit: "grapheme", maxLength: 60 }), (text) => {
      if (!/мозг/iu.test(text)) assert.equal(phraseCommand(text, mine), null);
    }),
    { seed: 20_261_124 },
  );
});
