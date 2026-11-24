// `iva sloy <папка>` — поставить или обновить «мой слой». Командой, а не путём к файлу: после
// `iva update` код живёт в каталоге версии, а каталоги памяти и данных могут быть своими.
import { join } from "node:path";
import { resolveVaultDir } from "../../packages/vault-dir/index.ts";
import { installLayer } from "../moy-sloy.ts";
import type { createCliRuntime } from "./runtime.ts";

type CliRuntime = ReturnType<typeof createCliRuntime>;

export function createSloyCommand(
  root: string,
  runtime: Pick<CliRuntime, "ok" | "dataDirAbs" | "readEnv">,
) {
  return (args: readonly string[]): void => {
    const source = args[0];
    if (!source) throw new Error("usage: iva sloy <папка моего слоя>");
    const result = installLayer(source, {
      data: runtime.dataDirAbs(),
      vault: resolveVaultDir(root, runtime.readEnv().ASSISTANT_VAULT_DIR),
      template: join(root, "vault-template"),
    });
    for (const line of result.notes) console.log(`• ${line}`);
    for (const file of result.written) runtime.ok(file);
    if (result.errors.length)
      throw new Error(result.errors.map((line) => `✖ ${line}`).join("\n"));
  };
}
