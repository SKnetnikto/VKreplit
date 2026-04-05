# VK Bot Admin

## Overview

VK community bot with an admin panel. The bot responds to messages in a VK community via Callback API. Supports command-based responses, AI intent recognition (free-form text), voice message transcription, and Odnoklassniki notification parsing.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Parsing**: Puppeteer + @sparticuz/chromium (headless browser)
- **AI**: OpenAI (intent detection + Whisper STT via user's API key)

## Artifacts

- `artifacts/api-server` — Express backend (API + VK Callback webhook)
- `artifacts/vk-bot-admin` — React admin panel (preview path: `/`)

## Environment Secrets Required

- `VK_TOKEN` — community access token (messages permission required)
- `VK_CONFIRMATION_CODE` — confirmation code from VK Callback API settings
- `VK_SECRET` — (optional) secret key for verifying VK requests
- `API_ROUTRE_AI` — OpenAI-compatible API key for AI intent detection + voice transcription
- `MODEL` — AI model to use (e.g. gpt-4o-mini)
- `PHONE` — Odnoklassniki phone/email for login
- `PASSWORD` — Odnoklassniki password

## VK Bot Setup

To connect the bot to VK:
1. Get a community token (Community Settings → API → Access Tokens)
2. Enable Callback API (Community Settings → API → Callback API)
3. Set the Callback URL to: `https://<your-domain>/api/vk/callback`
4. Copy the confirmation code from VK into `VK_CONFIRMATION_CODE` secret
5. Click "Confirm" in VK — bot should respond with the code

## Bot Commands

Built-in:
- `help` / `помощь` — show all available commands
- `ок уведомления` — get unread notification count from Odnoklassniki
- `ок сессия сброс` — clear saved OK session (re-login on next request)

Custom: configured via the admin panel at `/commands`

Free-form text: the AI will detect intent and route to the appropriate command.

Voice messages: automatically transcribed via Whisper, then processed as text.

## Key Files

- `artifacts/api-server/src/lib/ok-parser.ts` — Puppeteer-based OK.ru session + notifications scraper
- `artifacts/api-server/src/lib/ai-intent.ts` — AI intent detection + Whisper transcription
- `artifacts/api-server/src/routes/vk-callback.ts` — Main VK webhook handler

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — build all
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Tables

- `commands` — bot commands (trigger, response, description, is_active, usage_count)
- `bot_settings` — key-value bot settings
- `message_logs` — log of all received messages and bot responses
