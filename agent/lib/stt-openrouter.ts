// Расшифровка голоса ключом OpenRouter — тем же, что платит за модель. Используется, когда
// DEEPGRAM_API_KEY не задан (agent/transcribe.ts).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactNotice } from "./outbox.ts";
import { SttError, type SttMeta } from "./stt.ts";

const URL_STT = "https://openrouter.ai/api/v1/audio/transcriptions";
const DEFAULT_MODEL = "openai/gpt-4o-mini-transcribe";
const TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 60_000;

const BY_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
};
const BY_EXT: Record<string, string> = {
  ogg: "ogg",
  oga: "ogg",
  opus: "ogg",
  mp3: "mp3",
  m4a: "m4a",
  wav: "wav",
  webm: "webm",
  flac: "flac",
  aac: "aac",
};

// Формат, который OpenRouter примет как есть; null — сначала достать звук через ffmpeg
// (видео, кружок, незнакомый контейнер).
function directFormat(meta: SttMeta): string | null {
  const mime = (meta.mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (mime.startsWith("video/") || meta.tag === "video") return null;
  const byMime = BY_MIME[mime];
  if (byMime) return byMime;
  const ext = (meta.fileName ?? "").toLowerCase().split(".").pop() ?? "";
  const byExt = BY_EXT[ext];
  if (byExt) return byExt;
  // Голосовое Telegram — всегда ogg/opus, даже когда тип не назван.
  return meta.tag === "voice" && mime === "" ? "ogg" : null;
}

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-xerror",
        "-i",
        input,
        "-vn",
        "-ac",
        "1",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-f",
        "ogg",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: FFMPEG_TIMEOUT_MS },
    );
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", (error) => {
      console.error(`[transcribe] ffmpeg не запустился: ${error.message}`);
      reject(
        new SttError(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "не смог достать звук: на сервере нет ffmpeg"
            : "не смог достать звук: ffmpeg не запустился",
          { cause: error },
        ),
      );
    });
    child.on("close", (code, killed) => {
      if (code === 0) {
        resolve();
        return;
      }
      console.error(
        `[transcribe] ffmpeg ${String(code ?? killed)}: ${redactNotice(err.slice(0, 300))}`,
      );
      reject(
        new SttError(
          killed
            ? "не смог достать звук: запись слишком долгая"
            : "не смог достать звук: похоже, в файле его нет",
        ),
      );
    });
  });
}

// Через файл, а не трубу: у обычного mp4 указатель (moov) лежит в конце, и без перемотки
// ffmpeg читает ноль звука, но выходит с кодом 0.
async function extractOgg(audio: ArrayBuffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "iva-stt-"));
  try {
    const input = join(dir, "in");
    const output = join(dir, "out.ogg");
    await writeFile(input, Buffer.from(audio), { mode: 0o600 });
    await runFfmpeg(input, output);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function reason(status: number): string {
  if (status === 401 || status === 403)
    return "OpenRouter не принял ключ — проверь ключ: iva config";
  if (status === 402)
    return "на ключе OpenRouter кончились деньги — пополни баланс";
  if (status === 413) return "запись слишком большая — пришли её частями";
  if (status === 429)
    return "OpenRouter просит подождать: слишком часто — пришли запись ещё раз через минуту";
  return `OpenRouter ответил ошибкой ${status}`;
}

export async function transcribeOpenRouter(
  audio: ArrayBuffer,
  meta: SttMeta,
): Promise<string> {
  const direct = directFormat(meta);
  const data = direct ? Buffer.from(audio) : await extractOgg(audio);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch(URL_STT, {
      signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${(process.env.OPENROUTER_API_KEY ?? "").trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: (process.env.OPENROUTER_STT_MODEL ?? "").trim() || DEFAULT_MODEL,
        input_audio: { data: data.toString("base64"), format: direct ?? "ogg" },
      }),
    });
    if (!res.ok) {
      // Тело — причина провайдера для журнала; человеку идёт короткая понятная фраза.
      console.error(
        `[transcribe] OpenRouter ${res.status}: ${redactNotice((await res.text()).slice(0, 300))}`,
      );
      throw new SttError(reason(res.status));
    }
    const json = (await res.json()) as { text?: unknown; error?: unknown };
    if (json.error !== undefined) {
      console.error(
        `[transcribe] OpenRouter 200 с ошибкой: ${redactNotice(JSON.stringify(json.error).slice(0, 300))}`,
      );
      throw new SttError("OpenRouter не смог расшифровать запись");
    }
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (!text) throw new SttError("в записи не слышно слов");
    return text;
  } catch (error) {
    if (signal.aborted)
      throw new SttError(`OpenRouter не ответил за ${TIMEOUT_MS / 1000} с`, {
        cause: error,
      });
    if (error instanceof SttError) throw error;
    console.error(
      `[transcribe] нет связи с OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new SttError("нет связи с OpenRouter — попробуй ещё раз", {
      cause: error,
    });
  }
}
