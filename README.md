# Lead Generation Telegram Bot (Telegraf + Express)

This is a minimal, production-ready Telegram bot that uses **webhooks**. It exposes a single secret webhook path and responds to the core commands.

## Files
- `index.js` — the bot + express server
- `package.json` — dependencies and start script

## How to deploy on Render (simple)
1. Create a new GitHub repo and upload these two files.
2. In Render, create **Web Service** → connect your repo.
3. **Environment variables**:
   - `BOT_TOKEN` = your bot token from @BotFather
   - `WEBHOOK_SECRET` = any strong string (e.g., `leadgen-2025-secret`)
4. Deploy. Wait until it's **Healthy** and note your public URL: `https://<your-service>.onrender.com`
5. Set webhook (replace values):
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-service>.onrender.com/telegram/<WEBHOOK_SECRET>&drop_pending_updates=true
   ```
6. Open Telegram → search your bot → press **Start**.

## Verify webhook
- Check: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo`
- `url` must match your Render URL + `/telegram/<WEBHOOK_SECRET>`

If you need polling locally, replace the webhook section in `index.js` with `bot.launch()` temporarily.
