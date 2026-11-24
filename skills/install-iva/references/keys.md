# Step 5 — Keys (only what is missing)

Ask only for what the installer cannot know. Each answer goes into a file with mode 600 (`references/secrets.md`).

| Key | How the person gets it | Check before use |
|---|---|---|
| Model | OpenRouter only: the person writes the key into `moy-mozg/klyuchi.env` themselves; the model is already there. Ask them to set a spending limit on the key | the installer validates the key |
| Bot token | Telegram → @BotFather → `/newbot` → a name → a username ending in `bot` → copy the token | `getMe` returns `ok: true`; note the username |
| Person's Telegram ID | "Send your new bot any message." Then read it once: `getUpdates` → `message.from.id` and first name; confirm the name with the person. Do this before Iva starts — after that Iva owns the updates | a number, the confirmed name matches |
| Timezone | from the person's computer (pre-flight), confirm | IANA name, e.g. `Asia/Tashkent` |
| Language | the language the person writes to you in | `ru` or `en` |

Voice already works with the OpenRouter key. Web search (Tavily and others) are optional: tell the person they can add them later in the bot
with `/menu`. Do not ask for them now.

## The minimal env file

```
AGENT_LANGUAGE=ru
MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=openai/gpt-6-luna
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_ALLOWED_USER_IDS=<id>
ASSISTANT_TIMEZONE=<tz>
```

Subscriptions (Claude, ChatGPT) are not offered in this version: the model is OpenRouter. Everything else the installer fills in.

## Reading the ID without seeing the keys

Load the file in a child shell; print only the id and the name, never the URL with the token:

```bash
( set -a; . moy-mozg/klyuchi.env; set +a
  curl -fsS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" ) \
  | python3 -c 'import json,sys; print({(m["from"]["id"], m["from"].get("first_name")) for u in json.load(sys.stdin)["result"] if (m:=u.get("message"))})'
```

Windows PowerShell: read the line with `Select-String`, keep the token in a variable, call `Invoke-RestMethod`, print only
`message.from.id` and `first_name`. Then write the id into `TELEGRAM_ALLOWED_USER_IDS` of the same file.

A bot already connected to another service (a webhook is set — `getWebhookInfo` shows a URL) answers nobody through
Iva: ask the person before `deleteWebhook`.
