import express from "express";
import { Telegraf } from "telegraf";

// === ENV VARS ===
// Set these in Render (or any hosting) → Environment
const BOT_TOKEN = process.env.BOT_TOKEN;           // required
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "leadgen-secret"; // choose any secret string

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env var");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, {
  telegram: { webhookReply: true }
});

// === Commands ===
bot.start((ctx) => ctx.reply("Hey! I’m Nick 🤖\nI help you with Forex/Crypto leads. Type /menu"));
bot.command("menu", (ctx) => ctx.reply(
  "Choose:\n/live - Live Leads\n/hot - Hot Leads\n/recovery - Recovery Leads\n/ftd - FTDs\n/readyftd - Ready FTDs\n/pricing - Pricing & MOQs"
));
bot.command("live", (ctx) => ctx.reply("• Live Leads: $50–$110 (geo-dependent)\n• Fresh opt-ins, AI+human filtered\n• MOQ: 100\nPay: USDT TRC20"));
bot.command("hot", (ctx) => ctx.reply("• Hot Leads: $10\n• Registered + clicked deposit CTA\n• MOQ: 300\nPay: USDT TRC20"));
bot.command("recovery", (ctx) => ctx.reply("• Recovery: $10\n• Past depositors, reactivation potential\n• MOQ: 300\nPay: USDT TRC20"));
bot.command("ftd", (ctx) => ctx.reply("• FTDs: $1000–$1350 (geo/volume)\n• Ready to trade, 10%+ close rate\n• MOQ: 5\nPay: USDT TRC20"));
bot.command("readyftd", (ctx) => ctx.reply("• Ready FTDs: $2000–$2400\n• KYC done, $250+ deposited\n• You focus on retention\nPay: USDT TRC20"));
bot.command("pricing", (ctx) => ctx.reply(
  "Pricing & MOQs:\nLive: $50–$110 (MOQ 100)\nHot: $10 (MOQ 300)\nRecovery: $10 (MOQ 300)\nFTDs: $1000–$1350 (MOQ 5)\nReady FTDs: $2000–$2400"
));

// Fallback for any text
bot.on("text", async (ctx) => {
  await ctx.reply("Tell me what you need:\n• Type /menu to see all products\n• Share GEO + type (e.g., “Italy Recovery 300”)");
});

// === Web server + webhook endpoint ===
const app = express();
app.use(express.json());

// Telegram will POST updates to this path. Keep it secret.
app.use(`/telegram/${WEBHOOK_SECRET}`, bot.webhookCallback(`/telegram/${WEBHOOK_SECRET}`));

// Health check
app.get("/", (_, res) => res.send("OK"));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log("Webhook path ready at /telegram/" + WEBHOOK_SECRET);
  console.log("Set your webhook to: https://<YOUR_PUBLIC_URL>/telegram/" + WEBHOOK_SECRET);
});

