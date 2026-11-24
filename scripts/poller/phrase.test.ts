// Просьбы словами, которые исполняет мост: целое сообщение владельца, не пересылка.
import test from "node:test";
import assert from "node:assert/strict";
import { phraseCommand } from "./control.ts";

await test("слова открывают мозг и таблицу", () => {
  assert.equal(phraseCommand("Покажи мой мозг", false), "/mozg");
  assert.equal(phraseCommand("  покажи  мой мозг!  ", false), "/mozg");
  assert.equal(phraseCommand("Пришли таблицей.", false), "/tablica");
});

await test("пересылка, часть фразы и унаследованные ключи — не команда", () => {
  assert.equal(phraseCommand("покажи мой мозг", true), null);
  assert.equal(phraseCommand("покажи мой мозг Марине", false), null);
  assert.equal(phraseCommand("constructor", false), null);
});
