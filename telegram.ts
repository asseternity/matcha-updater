// telegram.ts
import TelegramBot from "node-telegram-bot-api";
import { scrapeProducts, Product } from "./scraper";

const token = process.env.TG_BOT_TOKEN;
if (!token) {
  console.error("TG_BOT_TOKEN missing. Telegram features disabled.");
}
// create bot in polling mode for simple deployment/testing
export const bot = new TelegramBot(token || "", { polling: !!token });

// utility to escape Markdown special chars
const escapeMarkdown = (s = "") =>
  s.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");

export const notifyAvailable = (products: Product[]) => {
  const available = products.filter((p) => p.status === "available");
  if (available.length === 0) return;
  const message = available
    .map(
      (p) =>
        `*${escapeMarkdown(p.name)}* is now AVAILABLE!\n${
          p.url
        }\nPrice: ${escapeMarkdown(p.priceJPY || "")}`
    )
    .join("\n\n");
  const chatId = process.env.TG_CHAT_ID;
  if (!chatId) return console.error("TG_CHAT_ID not set — cannot notify.");
  bot
    .sendMessage(chatId, message, { parse_mode: "Markdown" })
    .catch(console.error);
};

// /matcha command — scrapes on demand and replies with a short summary
bot.onText(/^\/matcha(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, "Running matcha scraper — please wait...");
    const products = await scrapeProducts();
    if (!products) {
      await bot.sendMessage(chatId, "Scrape failed or returned no data.");
      return;
    }

    const available = products.filter((p) => p.status === "available");
    const soldOutCount = products.length - available.length;

    let text = `*Matcha Catalog Summary*\nTotal: ${products.length}\nAvailable: ${available.length}\nSold out: ${soldOutCount}\n\n`;

    if (available.length) {
      // limit to first 10 available items to avoid huge messages
      text += available
        .slice(0, 10)
        .map(
          (p) =>
            `*${escapeMarkdown(p.name)}*\n${escapeMarkdown(
              p.priceJPY || ""
            )}\n${p.url}`
        )
        .join("\n\n");

      if (available.length > 10)
        text += `\n\n_and ${available.length - 10} more available..._`;
    } else {
      text += "No available products right now.";
    }

    await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error handling /matcha:", err);
    await bot.sendMessage(chatId, "Error while scraping. Check logs.");
  }
});
