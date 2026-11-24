# Мой слой — после того, как бот ответил

Папка `moy-mozg/` на компьютере человека: `pravila.md`, `obo-mne.md`, `navyki/*.md`. Ключи
(`klyuchi.env`) не переносим.

```bash
tar -C moy-mozg --exclude klyuchi.env -cf - . | ssh iva 'umask 077; rm -rf ~/moy-mozg && mkdir ~/moy-mozg && tar -C ~/moy-mozg -xf -'
ssh iva 'export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh >/dev/null; cd ~/iva && node scripts/moy-sloy.ts ~/moy-mozg'
```

Строки `✖` — причина отказа простыми словами: скажи человеку, что поправить, и повтори; до исправления
не записано ничего. `•` — файл о себе не тронут, потому что Ива уже накопила в нём своё.
Перезапуск не нужен: правила, навыки и файл о себе читаются каждый ход.
