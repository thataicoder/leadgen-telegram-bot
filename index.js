import express from "express";
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "leadgen-2025-secret";

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env var");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, {
  telegram: { webhookReply: true }
});

// Reply to ANY message
bot.on("message", (ctx) => {
  console.log("Message received:", ctx.message.text);
  ctx.reply(`✅ Got your message: "${ctx.message.text}"`);
});

const app = express();
app.use(express.json());

app.use(`/telegram/${WEBHOOK_SECRET}`, bot.webhookCallback(`/telegram/${WEBHOOK_SECRET}`));

app.get("/", (_, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log(`Webhook path ready at /telegram/${WEBHOOK_SECRET}`);
});
