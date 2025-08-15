import express from "express";
import { Telegraf, Markup } from "telegraf";

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";            // optional: your Telegram ID (use /whoami)
const SHEET_WEBAPP_URL = process.env.SHEET_WEBAPP_URL || "";      // optional: Google Apps Script Web App URL
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) { console.error("Missing BOT_TOKEN env var"); process.exit(1); }

// ====== GEO/MODEL PRICING CONFIG ======
// Edit values as needed. Keys MUST be lowercase.
const PRICING = {
  germany:   { live:{price:95,  moq:100}, hot:{price:12, moq:300}, recovery:{price:12, moq:300}, ftd:{price:1200, moq:5},  readyftd:{price:2200, moq:3} },
  italy:     { live:{price:85,  moq:100}, hot:{price:10, moq:300}, recovery:{price:10, moq:300}, ftd:{price:1150, moq:5},  readyftd:{price:2100, moq:3} },
  spain:     { live:{price:80,  moq:100}, hot:{price:10, moq:300}, recovery:{price:10, moq:300}, ftd:{price:1100, moq:5},  readyftd:{price:2050, moq:3} },
  france:    { live:{price:90,  moq:100}, hot:{price:11, moq:300}, recovery:{price:11, moq:300}, ftd:{price:1180, moq:5},  readyftd:{price:2180, moq:3} },
  uk:        { live:{price:100, moq:100}, hot:{price:13, moq:300}, recovery:{price:13, moq:300}, ftd:{price:1300, moq:5},  readyftd:{price:2300, moq:3} },
  uae:       { live:{price:110, moq:100}, hot:{price:14, moq:300}, recovery:{price:14, moq:300}, ftd:{price:1400, moq:5},  readyftd:{price:2400, moq:3} },
  saudi:     { live:{price:110, moq:100}, hot:{price:14, moq:300}, recovery:{price:14, moq:300}, ftd:{price:1450, moq:5},  readyftd:{price:2450, moq:3} },
  india:     { live:{price:55,  moq:100}, hot:{price:8,  moq:300}, recovery:{price:8,  moq:300}, ftd:{price:900,  moq:5},  readyftd:{price:1800, moq:3} },
  south_africa: { live:{price:65,  moq:100}, hot:{price:9, moq:300}, recovery:{price:9, moq:300}, ftd:{price:950, moq:5}, readyftd:{price:1850, moq:3} }
};

const TYPES = [
  ["Live", "live"],
  ["Hot", "hot"],
  ["Recovery", "recovery"],
  ["FTD", "ftd"],
  ["Ready FTD", "readyftd"],
];

const bot = new Telegraf(BOT_TOKEN);

// ===== Helpers =====
const geoList = Object.keys(PRICING);
function norm(s=""){ return String(s).trim().toLowerCase().replace(/\s+/g, "_"); }
function title(s){ return s.replace(/_/g, " ").replace(/\b\w/g, m=>m.toUpperCase()); }

function formatGeoPricing(geo){
  const g = PRICING[geo];
  const lines = [
    `🇺🇳 GEO: ${title(geo)}`,
    `• Live: $${g.live.price} — MOQ ${g.live.moq}`,
    `• Hot: $${g.hot.price} — MOQ ${g.hot.moq}`,
    `• Recovery: $${g.recovery.price} — MOQ ${g.recovery.moq}`,
    `• FTD: $${g.ftd.price} — MOQ ${g.ftd.moq}`,
    `• Ready FTD: $${g.readyftd.price} — MOQ ${g.readyftd.moq}`,
    `\nPayment: USDT TRC20`
  ];
  return lines.join("\n");
}

async function logEvent(event_type, ctx, extra={}){
  if(!SHEET_WEBAPP_URL) return; // optional
  try{
    const u = ctx.from || {}; const ch = ctx.chat || {}; const msg = ctx.message || {}; const cq = ctx.callbackQuery || {};
    const payload = {
      event_type,
      ts: new Date().toISOString(),
      user_id: u.id, username: u.username || "", first_name: u.first_name || "",
      chat_id: ch.id, chat_type: ch.type,
      message_id: msg.message_id || cq.message?.message_id || null,
      text: msg.text || cq.data || "",
      ...extra
    };
    // Fire-and-forget
    fetch(SHEET_WEBAPP_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .catch(e=>console.error("logEvent error:", e.message));
  }catch(e){ console.error("logEvent wrapper error:", e.message); }
}

// Global logger middleware (very light)
bot.use(async (ctx, next)=>{ logEvent("update", ctx); return next(); });

// ===== Content =====
const pricingIntro = `Pricing & Minimums
• Live Leads: $50–$110 (by GEO) — MOQ 100
• Hot Leads: $10 — MOQ 300
• Recovery Leads: $10 — MOQ 300
• FTDs: $1000–$1350 (GEO/volume) — MOQ 5
• Ready FTDs: $2000–$2400 — KYC done, $250+ deposited

Payment: USDT TRC20 only.`;

const menuText = `I’m Nick 🤖 — your Forex/Crypto lead desk.

What do you need?
• /pricing — Full price list by GEO
• /browse — Browse GEOs with buttons
• /order — Place an order request now
• /help — How to use this bot`;

// ===== Commands =====
bot.start(async (ctx)=>{ await ctx.reply(menuText); logEvent("start", ctx); });
bot.help((ctx)=> ctx.reply(`Use:
 /pricing — price list by GEO
 /browse — buttons to pick GEO
 /order — guided order flow
 /menu — main menu`));
bot.command("menu", (ctx)=> ctx.reply(menuText));

bot.command("pricing", async (ctx)=>{
  const parts = (ctx.message.text||"").split(/\s+/).slice(1);
  if (!parts.length){
    await ctx.reply(pricingIntro);
    await showGeoButtons(ctx, "Pick a GEO to view prices:");
    return logEvent("pricing_open", ctx);
  }
  const geo = norm(parts.join(" "));
  if(!PRICING[geo]){ await ctx.reply("Unknown GEO. Try /browse and pick from the list."); return; }
  await ctx.reply(formatGeoPricing(geo), Markup.inlineKeyboard([
    Markup.button.callback(`Request quote — ${title(geo)}`, `order_geo:${geo}`)
  ]));
  logEvent("pricing_geo", ctx, { geo });
});

bot.command("browse", async (ctx)=>{ await showGeoButtons(ctx, "Select your GEO:"); logEvent("browse", ctx); });

async function showGeoButtons(ctx, prompt){
  const buttons = geoList.map(g=>Markup.button.callback(title(g), `pricing_geo:${g}`));
  const rows = [];
  for (let i=0;i<buttons.length;i+=3) rows.push(buttons.slice(i,i+3));
  await ctx.reply(prompt, Markup.inlineKeyboard(rows));
}

// ===== Order flow (with optional prefill) =====
const sessions = new Map(); // chatId -> {step, data:{}}

function reset(chatId){ sessions.delete(chatId); }
function startOrder(ctx, prefill={}){
  const chatId = ctx.chat.id;
  sessions.set(chatId, { step: prefill.geo ? "type" : "geo", data: { ...prefill } });
  if(prefill.geo){ ctx.reply(`GEO set to ${title(prefill.geo)}. Now select lead type:`, typeButtons()); }
  else { ctx.reply("Great. Let’s create your order.\n\nFirst, which GEO(s)? e.g., Italy, Spain, Nordics"); }
  logEvent("order_start", ctx, prefill);
}

function typeButtons(){
  return Markup.inlineKeyboard(TYPES.map(([label,val])=>Markup.button.callback(label, `type:${val}`)), { columns: 2 });
}

bot.command("order", (ctx)=> startOrder(ctx));
bot.command("cancel", (ctx)=>{ reset(ctx.chat.id); ctx.reply("Order cancelled. Type /order to start again."); logEvent("order_cancel", ctx); });
bot.command("whoami", (ctx)=> ctx.reply("Your chat ID: "+ctx.from.id));

bot.on("callback_query", async (ctx)=>{
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  const data = ctx.callbackQuery.data || "";

  // From pricing/browse
  if (data.startsWith("pricing_geo:")){
    const geo = data.split(":")[1];
    await ctx.editMessageReplyMarkup();
    await ctx.reply(formatGeoPricing(geo), Markup.inlineKeyboard([
      Markup.button.callback(`Request quote — ${title(geo)}`, `order_geo:${geo}`)
    ]));
    return logEvent("pricing_geo_click", ctx, { geo });
  }

  if (data.startsWith("order_geo:")){
    const geo = data.split(":")[1];
    await ctx.editMessageReplyMarkup();
    return startOrder(ctx, { geo });
  }

  if (data.startsWith("type:")){
    if(!session) return ctx.answerCbQuery();
    session.data.type = data.split(":")[1];
    session.step = "qty";
    await ctx.editMessageReplyMarkup();
    await ctx.reply("Quantity? e.g., 100, 300, 5");
    return logEvent("order_step", ctx, { step:"type", ...session.data });
  }

  if(!session) return ctx.answerCbQuery();

  if (session.step === "confirm"){
    if (data === "confirm_yes"){
      await ctx.editMessageText("Submitting your request…");
      await submitOrder(ctx, session.data);
      reset(chatId);
      return logEvent("order_confirmed", ctx, session.data);
    }
    if (data === "confirm_no"){
      reset(chatId);
      await ctx.editMessageText("Cancelled. Type /order to start again.");
      return logEvent("order_cancel_confirm", ctx, session.data);
    }
  }

  ctx.answerCbQuery();
});

bot.on("text", async (ctx)=>{
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);

  if(!session){
    await ctx.reply("Type /pricing to see GEO prices, /browse to pick a GEO, or /order to place a request.");
    return logEvent("text_outside_flow", ctx, { text: ctx.message.text });
  }

  const text = (ctx.message.text || "").trim();
  const data = session.data;

  if(session.step === "geo"){
    const g = norm(text);
    data.geo = PRICING[g] ? g : text; // accept free text too
    session.step = "type";
    await ctx.reply("Select lead type:", typeButtons());
    return logEvent("order_step", ctx, { step:"geo", geo:data.geo });
  }

  if(session.step === "qty"){
    data.quantity = text;
    session.step = "contact";
    await ctx.reply("Your email or Telegram @handle for follow-up?");
    return logEvent("order_step", ctx, { step:"qty", quantity:data.quantity });
  }

  if(session.step === "contact"){
    data.contact = text;
    session.step = "notes";
    await ctx.reply("Any notes or requirements? (or type 'no')");
    return logEvent("order_step", ctx, { step:"contact", contact:data.contact });
  }

  if(session.step === "notes"){
    data.notes = text.toLowerCase()==="no" ? "" : text;

    const summary = `Please confirm your request:

GEO: ${title(norm(data.geo))}
Type: ${data.type}
Quantity: ${data.quantity}
Contact: ${data.contact}
Notes: ${data.notes || "-"}`;

    session.step = "confirm";
    await ctx.reply(summary, Markup.inlineKeyboard([
      Markup.button.callback("✅ Confirm", "confirm_yes"),
      Markup.button.callback("❌ Cancel", "confirm_no")
    ]));
    return logEvent("order_step", ctx, { step:"notes", ...data });
  }
});

async function submitOrder(ctx, data){
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

  if (ADMIN_CHAT_ID){
    const msg = `🔔 New Lead Request

From: @${payload.from_username || "-"} (${payload.from_name})
GEO: ${title(norm(payload.geo))}
Type: ${payload.type}
Qty: ${payload.quantity}
Contact: ${payload.contact}
Notes: ${payload.notes || "-"}`;
    try { await bot.telegram.sendMessage(ADMIN_CHAT_ID, msg); } catch(e){ console.error("Admin notify error:", e.message); }
  }

  if (SHEET_WEBAPP_URL){
    try{
      fetch(SHEET_WEBAPP_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ event_type:"order", ...payload }) })
        .catch(e=>console.error("sheet log error:", e.message));
    }catch(e){ console.error("sheet log error:", e.message); }
  }

  await ctx.reply("✅ Request received. We’ll contact you shortly with pricing & timelines. You can also type /pricing to review rates.");
}

// ===== Start POLLING (no webhooks) =====
bot.launch();
console.log("Polling started");

// tiny health server for Render
const app = express();
app.get("/", (_, res)=> res.send("OK"));
app.listen(PORT, ()=> console.log(`Health server on :${PORT}`));

// graceful shutdown
process.once("SIGINT", ()=> bot.stop("SIGINT"));
process.once("SIGTERM", ()=> bot.stop("SIGTERM"));
