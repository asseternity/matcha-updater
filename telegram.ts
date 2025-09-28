// telegram.ts
import TelegramBot from "node-telegram-bot-api";
import { scrapeProducts, Product } from "./scraper";

const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;

// Exported bot instance (null until initBot runs)
export let bot: TelegramBot | null = null;

// escape for MarkdownV2: escapes Telegram's reserved chars (kept conservative)
const escapeMdV2 = (s = "") =>
  s.replace(/([_*\[\]\(\)~`>#+=\-|{}.!])/g, "\\$1");

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
    // leave URL unescaped (Telegram link URL must be valid), but we've escaped the label
    return `[${name}](${url}) is ${p.status} • Price: ${price}`;
  });

  return [escapeMdV2(header), counts, ...lines].join("\n");
};

// Initialize bot — call this AFTER the server binds the port
export const initBot = (enablePolling = false) => {
  if (!token) {
    console.error("TG_BOT_TOKEN missing. Telegram features disabled.");
    return;
  }
  if (!chatId) {
    console.error("TG_CHAT_ID missing. Automatic notifications disabled.");
    // still create bot if you want to use interactive commands locally
  }

  bot = new TelegramBot(token, { polling: enablePolling });
  console.log("Telegram bot initialized. polling:", enablePolling);

  // Register /matcha command handler
  bot.onText(/^\/matcha(?:\s+(.+))?$/i, async (msg, match) => {
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
      await bot?.sendMessage(chatIdLocal, text, { parse_mode: "MarkdownV2" });
    } catch (err) {
      console.error("Error handling /matcha:", err);
      try {
        await bot?.sendMessage(
          chatIdLocal,
          "Error while scraping. Check logs."
        );
      } catch (_) {
        // ignore further errors
      }
    }
  });
};

// Robust notifyAvailable: chunk messages, catch errors, rate-limit a little
export const notifyAvailable = async (products: Product[]) => {
  if (!chatId) {
    console.error("notifyAvailable: TG_CHAT_ID not set — aborting notify.");
    return;
  }
  if (!bot) {
    console.error(
      "notifyAvailable: bot not initialized. Call initBot() first."
    );
    return;
  }

  const full = makeSummary(products, "automatic");
  const textLines = full.split("\n");

  const maxLength = 3800; // safe margin below Telegram 4096
  let chunk: string[] = [];
  let length = 0;

  for (const line of textLines) {
    // +1 for newline
    if (length + line.length + 1 > maxLength) {
      try {
        await bot.sendMessage(chatId, chunk.join("\n"), {
          parse_mode: "MarkdownV2",
        });
      } catch (err) {
        console.error("notifyAvailable: sendMessage error (chunk):", err);
      }
      // small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 250));
      chunk = [];
      length = 0;
    }
    chunk.push(line);
    length += line.length + 1;
  }

  if (chunk.length) {
    try {
      await bot.sendMessage(chatId, chunk.join("\n"), {
        parse_mode: "MarkdownV2",
      });
    } catch (err) {
      console.error("notifyAvailable: sendMessage error (final):", err);
    }
  }
};
