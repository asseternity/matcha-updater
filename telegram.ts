// telegram.ts
import TelegramBot from "node-telegram-bot-api";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
type Subscriber = PrismaClient["subscriber"] extends { findUnique: any }
  ? { id: number; chatId: number; createdAt: Date }
  : any;
import { scrapeProducts, Product } from "./scraper";

const token = process.env.TG_BOT_TOKEN ?? "";

// Exported bot instance (null until initBot runs)
export let bot: TelegramBot | null = null;

// helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// escape for MarkdownV2: escapes Telegram's reserved chars (kept conservative)
const escapeMdV2 = (s = "") =>
  s.replace(/([_*\[\]\(\)~`>#+=\-|{}.!])/g, "\\$1");

// chunk long text into safe message sizes
const chunkText = (text: string, maxLength = 3800): string[] => {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;

  for (const line of lines) {
    // if adding this line would exceed maximum, push current chunk first
    if (len + line.length + 1 > maxLength) {
      chunks.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }

  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
};

export const makeSummary = (
  products: Product[],
  mode: "automatic" | "requested"
) => {
  const total = products.length;
  const availableCount = products.filter(
    (p) => p.status === "available"
  ).length;
  const soldOutCount = total - availableCount;

  const header = mode === "automatic" ? "automatic update" : "requested update";
  const counts = `Total: ${total} • Available: ${availableCount} • Sold Out: ${soldOutCount}`;

  const lines = products.map((p) => {
    const name = escapeMdV2(p.name || "");
    const price = escapeMdV2(p.priceJPY || "");
    const url = p.url || "";
    return `[${name}](${url}) is ${p.status} • Price: ${price}`;
  });

  // header contains Markdown chars, escape it
  return [escapeMdV2(header), counts, ...lines].join("\n");
};

// Initialize bot — call this AFTER the server binds the port
export const initBot = (enablePolling = false) => {
  if (!token) {
    console.error("TG_BOT_TOKEN missing. Telegram features disabled.");
    return;
  }

  bot = new TelegramBot(token, { polling: enablePolling });
  console.log("Telegram bot initialized. polling:", enablePolling);

  // Register /subscribe command handler
  bot.onText(/^\/subscribe(?:\s+(.+))?$/i, async (msg) => {
    const newChatId: number = msg.chat.id;
    try {
      const existing = await prisma.subscriber.findUnique({
        where: { chatId: newChatId },
      });

      if (existing) {
        await bot?.sendMessage(
          newChatId,
          "You are already subscribed to Matcha Bot."
        );
        return;
      }

      await prisma.subscriber.create({
        data: { chatId: newChatId },
      });

      await bot?.sendMessage(
        newChatId,
        "You have successfully subscribed to Matcha Bot!"
      );
    } catch (err) {
      console.error("/subscribe error:", err);
      await bot?.sendMessage(
        newChatId,
        "Error subscribing to Matcha Bot. Please notify the creator."
      );
    }
  });

  // Register /unsubscribe command handler
  bot.onText(/^\/unsubscribe(?:\s+(.+))?$/i, async (msg) => {
    const requestedChatId: number = msg.chat.id;
    try {
      const existing = await prisma.subscriber.findUnique({
        where: { chatId: requestedChatId },
      });

      if (!existing) {
        await bot?.sendMessage(
          requestedChatId,
          "You are not subscribed to Matcha Bot."
        );
        return;
      }

      await prisma.subscriber.delete({
        where: { chatId: requestedChatId },
      });

      await bot?.sendMessage(
        requestedChatId,
        "You have unsubscribed from Matcha Bot."
      );
    } catch (err) {
      console.error("/unsubscribe error:", err);
      await bot?.sendMessage(
        requestedChatId,
        "Error unsubscribing. Please notify the creator."
      );
    }
  });

  // Register /matcha command handler
  bot.onText(/^\/matcha(?:\s+(.+))?$/i, async (msg) => {
    const chatIdLocal = msg.chat.id;
    try {
      await bot?.sendMessage(
        chatIdLocal,
        "Running matcha scraper — please wait..."
      );
      const products = await scrapeProducts();
      if (!products || products.length === 0) {
        await bot?.sendMessage(
          chatIdLocal,
          "Scrape failed or returned no data."
        );
        return;
      }
      const text = makeSummary(products, "requested");
      const chunks = chunkText(text);
      for (const c of chunks) {
        await sendChunkedMessage(chatIdLocal, c, "MarkdownV2");
      }
    } catch (err) {
      console.error("Error handling /matcha:", err);
      await bot?.sendMessage(chatIdLocal, "Error while scraping. Check logs.");
    }
  });

  // /start command — initial greeting
  bot.onText(/^\/start$/i, async (msg) => {
    const chatIdLocal = msg.chat.id;
    await bot?.sendMessage(
      chatIdLocal,
      `👋 Welcome to Matcha Bot! This bot checks availability and prices of Matcha. Use the following commands:

/subscribe — Subscribe to automatic matcha updates
/unsubscribe — Stop receiving updates
/matcha — Run a manual matcha update immediately
/help — Show this help message`
    );
  });

  // /help command — just instructions
  bot.onText(/^\/help$/i, async (msg) => {
    const chatIdLocal = msg.chat.id;
    await bot?.sendMessage(
      chatIdLocal,
      `ℹ️ Matcha Bot Commands:

/subscribe — Subscribe to automatic matcha updates
/unsubscribe — Stop receiving updates
/matcha — Run a manual matcha update immediately
/start — Show welcome message`
    );
  });
};

// sendChunkedMessage (keeps your original but slightly hardened)
const sendChunkedMessage = async (
  chatId: number | string,
  text: string,
  parseMode: "MarkdownV2" | undefined = "MarkdownV2"
) => {
  const maxLength = 3800; // safe margin below 4096
  const lines = text.split("\n");
  let chunk: string[] = [];
  let length = 0;

  for (const line of lines) {
    if (length + line.length + 1 > maxLength) {
      await bot?.sendMessage(chatId, chunk.join("\n"), {
        parse_mode: parseMode,
      });
      await sleep(250);
      chunk = [];
      length = 0;
    }
    chunk.push(line);
    length += line.length + 1;
  }
  if (chunk.length) {
    await bot?.sendMessage(chatId, chunk.join("\n"), { parse_mode: parseMode });
  }
};

// Robust notifyAvailable: pre-chunk, batch subscribers, handle errors (403)
export const notifyAvailable = async (products: Product[]) => {
  if (!bot) {
    console.error(
      "notifyAvailable: bot not initialized. Call initBot() first."
    );
    return;
  }

  const subscribers = await prisma.subscriber.findMany();
  if (subscribers.length === 0) {
    console.log("notifyAvailable: no subscribers.");
    return;
  }

  const full = makeSummary(products, "automatic");
  const chunks = chunkText(full);

  const BATCH_SIZE = 20; // adjust to taste
  const BATCH_DELAY_MS = 500; // pause between batches

  for (const chunk of chunks) {
    // send this chunk to all subscribers in batches
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (sub: Subscriber) => {
          try {
            await bot!.sendMessage(sub.chatId, chunk, {
              parse_mode: "MarkdownV2",
            });
          } catch (err: any) {
            // If bot is blocked or chat not found, remove subscription
            const status = err?.response?.statusCode ?? err?.statusCode ?? null;
            if (status === 403 || status === 400 || status === 410) {
              try {
                console.log(
                  `Removing subscriber ${sub.chatId} due to Telegram error ${status}`
                );
                await prisma.subscriber.delete({
                  where: { chatId: sub.chatId },
                });
              } catch (dbErr) {
                console.error(
                  "Failed to remove subscriber after Telegram error:",
                  dbErr
                );
              }
            } else {
              console.error("notifyAvailable: sendMessage error:", err);
            }
          }
        })
      );

      // sleep between batches to avoid hitting rate limits
      await sleep(BATCH_DELAY_MS);
    }
  }
};
