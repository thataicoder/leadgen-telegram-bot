import express from "express";
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error("Missing BOT_TOKEN env var"); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);

// Reply to ANY message
bot.on("message", (ctx) => {
  console.log("Message received:", ctx.message.text);
  return ctx.reply(`✅ Got your message: "${ctx.message.text}"`);
});

// Start polling (no webhook)
bot.launch();
console.log("Polling started");

const app = express();
app.get("/", (_, res) => res.send("OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Health server on :${PORT}`));

// graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
