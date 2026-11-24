// Голос ключом OpenRouter: что уходит на провод и что видит владелец, когда не вышло.
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SttError, transcribe, voiceConfigured } from "../transcribe.ts";

type Body = { model: string; input_audio: { data: string; format: string } };

function setup(
  t: TestContext,
  env: Record<string, string>,
  reply: () => Response,
) {
  const names = [
    "DEEPGRAM_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_STT_MODEL",
  ];
  const saved = names.map((n) => [n, process.env[n]] as const);
  t.after(() => {
    for (const [n, v] of saved) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  });
  for (const n of names) delete process.env[n];
  Object.assign(process.env, env);
  const sent: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return Promise.resolve(reply());
  });
  return sent;
}
const ok = (text: string) => () => new Response(JSON.stringify({ text }));
const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as Body;

await test("ключ только OpenRouter: запись уходит в OpenRouter с форматом ogg", async (t) => {
  const sent = setup(t, { OPENROUTER_API_KEY: "or-test" }, ok("привет"));
  const out = await transcribe(bytes("звук"), {
    mimeType: "audio/ogg",
    tag: "voice",
  });
  assert.equal(out, "привет");
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0]?.url,
    "https://openrouter.ai/api/v1/audio/transcriptions",
  );
  const body = bodyOf(sent[0].init);
  assert.equal(body.model, "openai/gpt-4o-mini-transcribe");
  assert.equal(body.input_audio.format, "ogg");
  assert.equal(Buffer.from(body.input_audio.data, "base64").toString(), "звук");
});

await test("есть ключ Deepgram — идём в Deepgram, как раньше", async (t) => {
  const sent = setup(
    t,
    { DEEPGRAM_API_KEY: "dg", OPENROUTER_API_KEY: "or" },
    () =>
      new Response(
        JSON.stringify({
          results: { channels: [{ alternatives: [{ transcript: "да" }] }] },
        }),
      ),
  );
  assert.equal(await transcribe(bytes("x"), { mimeType: "audio/ogg" }), "да");
  assert.match(sent[0].url, /^https:\/\/api\.deepgram\.com\//u);
});

await test("модель меняется настройкой, mp3 остаётся mp3 без перекодирования", async (t) => {
  const sent = setup(
    t,
    { OPENROUTER_API_KEY: "or", OPENROUTER_STT_MODEL: "openai/whisper-1" },
    ok("а"),
  );
  await transcribe(bytes("mp3"), {
    mimeType: "audio/mpeg",
    fileName: "a.mp3",
    tag: "audio",
  });
  const body = bodyOf(sent[0].init);
  assert.equal(body.model, "openai/whisper-1");
  assert.equal(body.input_audio.format, "mp3");
});

await test("формат виден по имени файла, когда Telegram не назвал тип", async (t) => {
  const sent = setup(t, { OPENROUTER_API_KEY: "or" }, ok("а"));
  await transcribe(bytes("m"), { fileName: "запись.M4A", tag: "audio" });
  assert.equal(bodyOf(sent[0].init).input_audio.format, "m4a");
});

await test(
  "кружок mp4: из видео достаём звук, уходит ogg",
  { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "iva-krug-"));
    t.after(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const file = join(dir, "krug.mp4");
    // Обычный mp4, как у Telegram: указатель (moov) в конце файла. Такой через трубу не читается.
    const made = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=duration=20:amplitude=0.3",
      "-f",
      "lavfi",
      "-i",
      "testsrc=s=240x240:d=20",
      "-c:v",
      "mpeg4",
      "-c:a",
      "aac",
      file,
    ]);
    assert.equal(made.status, 0, made.stderr.toString());
    const sent = setup(t, { OPENROUTER_API_KEY: "or" }, ok("кружок"));
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
    assert.equal(
      await transcribe(ab, { mimeType: "video/mp4", tag: "video" }),
      "кружок",
    );
    const body = bodyOf(sent[0].init);
    assert.ok(
      Buffer.from(body.input_audio.data, "base64").byteLength > 20000,
      "звук 20 секунд, а не пустая оболочка",
    );
    assert.equal(body.input_audio.format, "ogg");
    assert.equal(
      Buffer.from(body.input_audio.data, "base64").subarray(0, 4).toString(),
      "OggS",
    );
  },
);

for (const [status, seen] of [
  [401, /ключ/iu],
  [402, /деньги|баланс/iu],
  [429, /часто/iu],
  [413, /длинн|больш/iu],
  [500, /500/u],
] as const)
  await test(`отказ ${status}: человек видит причину, ключ не виден`, async (t) => {
    setup(
      t,
      { OPENROUTER_API_KEY: "or-secret-123" },
      () =>
        new Response(JSON.stringify({ error: { message: "no" } }), { status }),
    );
    await assert.rejects(
      transcribe(bytes("x"), { mimeType: "audio/ogg" }),
      (e: unknown) => {
        assert.ok(e instanceof SttError);
        assert.match(e.message, seen);
        assert.doesNotMatch(e.message, /or-secret-123/u);
        return true;
      },
    );
  });

await test("пустая расшифровка — ошибка, а не молчание", async (t) => {
  setup(t, { OPENROUTER_API_KEY: "or" }, ok("  "));
  await assert.rejects(
    transcribe(bytes("x"), { mimeType: "audio/ogg" }),
    SttError,
  );
});

await test("голос настроен, если есть любой из двух ключей", () => {
  assert.equal(voiceConfigured({}), false);
  assert.equal(voiceConfigured({ DEEPGRAM_API_KEY: " " }), false);
  assert.equal(voiceConfigured({ OPENROUTER_API_KEY: "a" }), true);
  assert.equal(voiceConfigured({ DEEPGRAM_API_KEY: "a" }), true);
});
