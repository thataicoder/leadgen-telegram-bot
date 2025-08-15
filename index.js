import express from "express";
import { Telegraf, Markup } from "telegraf";

// === ENV VARS ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "leadgen-2025-secret"; // keep in sync with webhook URL
const PUBLIC_URL = process.env.PUBLIC_URL; // REQUIRED to auto-set webhook
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ""; // optional
const SHEET_WEBAPP_URL = process.env.SHEET_WEBAPP_URL || ""; // optional
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) { console.error("Missing BOT_TOKEN env var"); process.exit(1); }
if (!PUBLIC_URL) { console.error("Missing PUBLIC_URL env var"); }

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
bot.help((ctx) => ctx.reply(`Use:
/pricing — price list
/order — guided order flow
/menu — main menu`));
bot.command("menu", (ctx) => ctx.reply(menuText));

bot.command("pricing", (ctx) => ctx.reply(pricing));
bot.command("live", (ctx) => ctx.reply("• Live Leads: $50–$110 (geo-dependent)
• Fresh opt-ins, AI+human filtered
• MOQ: 100
Pay: USDT TRC20"));
bot.command("hot", (ctx) => ctx.reply("• Hot Leads: $10
• Registered + clicked deposit CTA
• MOQ: 300
Pay: USDT TRC20"));
bot.command("recovery", (ctx) => ctx.reply("• Recovery Leads: $10
• Past depositors, reactivation potential
• MOQ: 300
Pay: USDT TRC20"));
bot.command("ftd", (ctx) => ctx.reply("• FTDs: $1000–$1350 (GEO/volume)
• Ready to trade, 10%+ close rate
• MOQ: 5
Pay: USDT TRC20"));
bot.command("readyftd", (ctx) => ctx.reply("• Ready FTDs: $2000–$2400
• KYC done, $250+ deposited
• You focus on retention
Pay: USDT TRC20"));

// ====== Order flow (simple state machine) ======
const sessions = new Map(); // chatId -> {step, data:{}}
const TYPES = [["Live","live"],["Hot","hot"],["Recovery","recovery"],["FTD","ftd"],["Ready FTD","readyftd"]];
function reset(chatId){ sessions.delete(chatId); }
function startOrder(ctx){ const chatId=ctx.chat.id; sessions.set(chatId,{step:"geo",data:{}}); ctx.reply("Great. Let’s create your order.

First, which GEO(s)? e.g., Italy, Spain, Nordics"); }

bot.command("order", (ctx)=>startOrder(ctx));
bot.command("cancel", (ctx)=>{ reset(ctx.chat.id); ctx.reply("Order cancelled. Type /order to start again."); });
bot.command("whoami", (ctx)=>ctx.reply("Your chat ID: "+ctx.from.id));

bot.on("callback_query", async (ctx)=>{
  const chatId=ctx.chat.id; const session=sessions.get(chatId); if(!session) return ctx.answerCbQuery();
  const data=ctx.callbackQuery.data;
  if(session.step==="type"){ session.data.type=data; session.step="qty"; await ctx.editMessageReplyMarkup(); return ctx.reply("Quantity? e.g., 100, 300, 5"); }
  if(session.step==="confirm"){ if(data==="confirm_yes"){ await ctx.editMessageText("Submitting your request…"); await submitOrder(ctx, session.data); reset(chatId); return; } if(data==="confirm_no"){ reset(chatId); await ctx.editMessageText("Cancelled. Type /order to start again."); return; } }
  ctx.answerCbQuery();
});

bot.on("text", async (ctx)=>{
  const chatId=ctx.chat.id; const session=sessions.get(chatId);
  if(!session){
    // Always reply when not in order flow (diagnostic + UX)
    return ctx.reply("Type /menu to see options or /order to place a request.");
  }
  const text=(ctx.message.text||"").trim(); const data=session.data;
  if(session.step==="geo"){ data.geo=text; session.step="type"; return ctx.reply("Select lead type:", Markup.inlineKeyboard(TYPES.map(([label,val])=>Markup.button.callback(label,val)),{columns:2})); }
  if(session.step==="qty"){ data.quantity=text; session.step="contact"; return ctx.reply("Your email or Telegram @handle for follow-up?"); }
  if(session.step==="contact"){ data.contact=text; session.step="notes"; return ctx.reply("Any notes or requirements? (or type 'no')"); }
  if(session.step==="notes"){ data.notes=text.toLowerCase()==="no"?"":text; const summary=`Please confirm your request:

GEO: ${data.geo}
Type: ${data.type}
Quantity: ${data.quantity}
Contact: ${data.contact}
Notes: ${data.notes||"-"}`; session.step="confirm"; return ctx.reply(summary, Markup.inlineKeyboard([Markup.button.callback("✅ Confirm","confirm_yes"), Markup.button.callback("❌ Cancel","confirm_no")])); }
});

async function submitOrder(ctx, data){
  const payload={ timestamp:new Date().toISOString(), from_name:ctx.from?.first_name||"", from_username:ctx.from?.username||"", chat_id:ctx.chat?.id||"", geo:data.geo, type:data.type, quantity:data.quantity, contact:data.contact, notes:data.notes||"" };
  if(ADMIN_CHAT_ID){ const msg=`🔔 New Lead Request

From: @${payload.from_username||"-"} (${payload.from_name})
GEO: ${payload.geo}
Type: ${payload.type}
Qty: ${payload.quantity}
Contact: ${payload.contact}
Notes: ${payload.notes||"-"}`; try{ await bot.telegram.sendMessage(ADMIN_CHAT_ID, msg); }catch(e){ console.error("Admin notify error:", e.message); } }
  if(SHEET_WEBAPP_URL){ try{ const res=await fetch(SHEET_WEBAPP_URL,{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)}); console.log("Sheet log status:", res.status); }catch(e){ console.error("Sheet log error:", e.message); } }
  await ctx.reply("✅ Request received. We’ll contact you shortly with pricing & timelines. You can also type /pricing to review rates.");
}

// ====== Express + webhook ======
const app=express();
app.use(express.json());
app.use(`/telegram/${WEBHOOK_SECRET}`, bot.webhookCallback(`/telegram/${WEBHOOK_SECRET}`));
app.get("/", (_,res)=>res.send("OK"));

app.listen(PORT, async ()=>{
  console.log(`Server listening on :${PORT}`);
  console.log(`Webhook path ready at /telegram/${WEBHOOK_SECRET}`);
  // Auto-set webhook if PUBLIC_URL provided
  if(PUBLIC_URL){
    try{
      const hook = `${PUBLIC_URL.replace(/\/$/, '')}/telegram/${WEBHOOK_SECRET}`;
      await bot.telegram.setWebhook(hook, { drop_pending_updates: true });
      const info = await bot.telegram.getWebhookInfo();
      console.log("Webhook set to:", info.url);
    }catch(e){ console.error("setWebhook error:", e.message); }
  } else {
    console.warn("PUBLIC_URL not set; set webhook manually in Telegram API.");
  }
});

// Global error logger
bot.catch((err, ctx)=>{ console.error("Bot error:", err); try{ ctx.reply("⚠️ Something went wrong. Try again."); }catch(_){} });
``

---

## Post-deploy quick steps
1. Render → Manual Deploy → **Clear build cache & deploy**
2. Webhook (**already set** to `leadgen-2025-secret`). If needed, set again:
