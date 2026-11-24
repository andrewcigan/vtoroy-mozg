// Общее для обоих провайдеров расшифровки: сведения о файле и ошибка, чей текст можно показать
// владельцу (без ключей и тел ответов).
export type SttMeta = {
  readonly mimeType?: string;
  readonly fileName?: string;
  readonly tag?: string;
};

export class SttError extends Error {
  override readonly name = "SttError";
}

/** Голос настроен: есть ключ Deepgram или ключ OpenRouter. */
export function voiceConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    (env.DEEPGRAM_API_KEY ?? "").trim() ||
    (env.OPENROUTER_API_KEY ?? "").trim(),
  );
}
