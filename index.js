import express from "express";
import { Telegraf, Markup } from "telegraf";

// === ENV VARS ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "leadgen-2025-secret"; // keep this value aligned with your webhook URL
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ""; // optional: your Telegram user ID to receive instant notifications
const SHEET_WEBAPP_URL = process.env.SHEET_WEBAPP_URL || ""; // optional: Google Apps Script Web App endpoint to log orders
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env var");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, { telegram: { webhookReply: true } });

// ====== Content ======
const pricing = `Pricing & Minimums
• Live Leads: $50–$110 (by GEO) — MOQ 100
• Hot Leads: $10 — MOQ 300
• Recovery Leads: $10 — MOQ 300
• FTDs: $1000–$1350 (GEO/volume) — MOQ 5
• Ready FTDs: $2000–$2400 — KYC done, $250+ deposited

Payment: USDT TRC20 only.
Turnaround & quality controls are handled with AI + human verification.`;

const menuText = `I’m Nick 🤖 — your Forex/Crypto lead desk.

What do you need?
• /live — Live Leads details
• /hot — Hot Leads details
• /recovery — Recovery Leads details
• /ftd — First-Time Depositors
• /readyftd — Ready FTDs (KYC+Deposit)
• /pricing — Full price list
• /order — Place an order request now
• /help — How to use this bot`;

// ====== Commands ======
bot.start((ctx) => ctx.reply(menuText));
bot.help((ctx) => ctx.reply(`Use:\n/pricing — price list\n/order — guided order flow\n/menu — main menu`));
bot.command("menu", (ctx) => ctx.reply(menuText));

bot.command("pricing", (ctx) => ctx.reply(pricing));
bot.command("live", (ctx) => ctx.reply("• Live Leads: $50–$110 (geo-dependent)\n• Fresh opt-ins, AI+human filtered\n• MOQ: 100\nPay: USDT TRC20"));
bot.command("hot", (ctx) => ctx.reply("• Hot Leads: $10\n• Registered + clicked deposit CTA\n• MOQ: 300\nPay: USDT TRC20"));
bot.command("recovery", (ctx) => ctx.reply("• Recovery Leads: $10\n• Past depositors, reactivation potential\n• MOQ: 300\nPay: USDT TRC20"));
bot.command("ftd", (ctx) => ctx.reply("• FTDs: $1000–$1350 (GEO/volume)\n• Ready to trade, 10%+ close rate\n• MOQ: 5\nPay: USDT TRC20"));
bot.command("readyftd", (ctx) => ctx.reply("• Ready FTDs: $2000–$2400\n• KYC done, $250+ deposited\n• You focus on retention\nPay: USDT TRC20"));

// ====== Order flow (simple state machine) ======
const sessions = new Map(); // chatId -> {step, data:{}}

const TYPES = [
  ["Live", "live"],
  ["Hot", "hot"],
  ["Recovery", "recovery"],
  ["FTD", "ftd"],
  ["Ready FTD", "readyftd"]
];

function reset(chatId) {
  sessions.delete(chatId);
}

function startOrder(ctx) {
  const chatId = ctx.chat.id;
  sessions.set(chatId, { step: "geo", data: {} });
  ctx.reply("Great. Let’s create your order.\n\nFirst, which GEO(s)? e.g., Italy, Spain, Nordics");
}

bot.command("order", (ctx) => startOrder(ctx));
bot.command("cancel", (ctx) => { reset(ctx.chat.id); ctx.reply("Order cancelled. Type /order to start again."); });
bot.command("whoami", (ctx) => ctx.reply("Your chat ID: " + ctx.from.id));

bot.on("callback_query", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session) return ctx.answerCbQuery();

  const data = ctx.callbackQuery.data;

  if (session.step === "type") {
    session.data.type = data; // one of 'live'|'hot'|'recovery'|'ftd'|'readyftd'
    session.step = "qty";
    await ctx.editMessageReplyMarkup(); // remove buttons
    return ctx.reply("Quantity? e.g., 100, 300, 5");
  }

  if (session.step === "confirm") {
    if (data === "confirm_yes") {
      await ctx.editMessageText("Submitting your request…");
      await submitOrder(ctx, session.data);
      reset(chatId);
      return;
    }
    if (data === "confirm_no") {
      reset(chatId);
      await ctx.editMessageText("Cancelled. Type /order to start again.");
      return;
    }
  }

  ctx.answerCbQuery();
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);

  if (!session) {
    // Not in order flow → friendly hint
    return ctx.reply("Type /menu to see options or /order to place a request.");
  }

  const text = (ctx.message.text || "").trim();
  const data = session.data;

  if (session.step === "geo") {
    data.geo = text;
    session.step = "type";
    return ctx.reply("Select lead type:", Markup.inlineKeyboard(
      TYPES.map(([label, val]) => Markup.button.callback(label, val)), { columns: 2 }
    ));
  }

  if (session.step === "qty") {
    data.quantity = text;
    session.step = "contact";
    return ctx.reply("Your email or Telegram @handle for follow-up?");
  }

  if (session.step === "contact") {
    data.contact = text;
    session.step = "notes";
    return ctx.reply("Any notes or requirements? (or type 'no')");
  }

  if (session.step === "notes") {
    data.notes = text.toLowerCase() === "no" ? "" : text;

    const summary = `Please confirm your request:

GEO: ${data.geo}
Type: ${data.type}
Quantity: ${data.quantity}
Contact: ${data.contact}
Notes: ${data.notes || "-"}`;

    session.step = "confirm";
    return ctx.reply(summary, Markup.inlineKeyboard([
      Markup.button.callback("✅ Confirm", "confirm_yes"),
      Markup.button.callback("❌ Cancel", "confirm_no")
    ]));
  }
});

async function submitOrder(ctx, data) {
  const payload = {
    timestamp: new Date().toISOString(),
    from_name: ctx.from?.first_name || "",
    from_username: ctx.from?.username || "",
    chat_id: ctx.chat?.id || "",
    geo: data.geo,
    type: data.type,
    quantity: data.quantity,
    contact: data.contact,
    notes: data.notes || ""
  };

  // 1) Notify ADMIN (if configured)
  if (ADMIN_CHAT_ID) {
    const msg = `🔔 New Lead Request

From: @${payload.from_username || "-"} (${payload.from_name})
GEO: ${payload.geo}
Type: ${payload.type}
Qty: ${payload.quantity}
Contact: ${payload.contact}
Notes: ${payload.notes || "-"}`;
    try { await bot.telegram.sendMessage(ADMIN_CHAT_ID, msg); } catch (e) { console.error("Admin notify error:", e.message); }
  }

  // 2) Log to Google Sheet via Apps Script (if configured)
  if (SHEET_WEBAPP_URL) {
    try {
      const res = await fetch(SHEET_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log("Sheet log status:", res.status);
    } catch (e) {
      console.error("Sheet log error:", e.message);
    }
  }

  // 3) Acknowledge user
  await ctx.reply("✅ Request received. We’ll contact you shortly with pricing & timelines. You can also type /pricing to review rates.");
}

// ====== Express + webhook ======
const app = express();
app.use(express.json());
app.use(`/telegram/${WEBHOOK_SECRET}`, bot.webhookCallback(`/telegram/${WEBHOOK_SECRET}`));
app.get("/", (_, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log(`Webhook path ready at /telegram/${WEBHOOK_SECRET}`);
  console.log("If needed, set your webhook to: https://<YOUR_PUBLIC_URL>/telegram/" + WEBHOOK_SECRET);
});
