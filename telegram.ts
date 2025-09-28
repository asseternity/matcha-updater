// telegram.ts
import TelegramBot from "node-telegram-bot-api";
import { scrapeProducts, Product } from "./scraper";

const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;

if (!token) console.error("TG_BOT_TOKEN missing. Telegram features disabled.");
if (!chatId)
  console.error("TG_CHAT_ID missing. Automatic notifications disabled.");

export const bot = new TelegramBot(token || "", { polling: !!token });

// escape for MarkdownV2 but DO NOT escape dots or slashes (keeps URLs usable)
const escapeMdV2 = (s = "") => s.replace(/([_*\[\]()~`>#+\-=|{}!])/g, "\\$1");

export const makeSummary = (
  products: Product[],
  mode: "automatic" | "requested"
) => {
  const total = products.length;
  const availableCount = products.filter(
    (p) => p.status === "available"
  ).length;
  const soldOutCount = total - availableCount;

  const header = `${
    mode === "automatic" ? "automatic update" : "requested update"
  }`;
  const counts = `Total: ${total} | Available: ${availableCount} | Sold Out: ${soldOutCount} |`;

  const lines = products.map((p) => {
    const name = escapeMdV2(p.name || "");
    const price = escapeMdV2(p.priceJPY || "");
    // URL kept raw so Telegram auto-links it correctly under MarkdownV2
    const url = p.url || "";
    return `${name} is ${p.status} | Price: ${price} | Link: ${url}`;
  });

  return [header, counts, ...lines].join("\n");
};

export const notifyAvailable = async (products: Product[]) => {
  try {
    if (!chatId) {
      console.error("notifyAvailable: TG_CHAT_ID not set — aborting notify.");
      return;
    }

    const text = makeSummary(products, "automatic");
    await bot.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
    console.log("notifyAvailable: summary sent");
  } catch (err) {
    console.error("notifyAvailable: sendMessage error:", err);
  }
};

bot.onText(/^\/matcha(?:\s+(.+))?$/i, async (msg, match) => {
  const chatIdLocal = msg.chat.id;
  try {
    await bot.sendMessage(
      chatIdLocal,
      "Running matcha scraper — please wait..."
    );
    const products = await scrapeProducts();
    if (!products) {
      await bot.sendMessage(chatIdLocal, "Scrape failed or returned no data.");
      return;
    }
    const text = makeSummary(products, "requested");
    await bot.sendMessage(chatIdLocal, text, { parse_mode: "MarkdownV2" });
  } catch (err) {
    console.error("Error handling /matcha:", err);
    await bot.sendMessage(chatIdLocal, "Error while scraping. Check logs.");
  }
});
