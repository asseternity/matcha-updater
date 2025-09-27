import TelegramBot from "node-telegram-bot-api";
import { Product } from "./scraper";
const bot = new TelegramBot(process.env.TG_BOT_TOKEN || "", { polling: false });
const chatId = process.env.TG_CHAT_ID || "";

export const notifyAvailable = (products: Product[]) => {
  const available = products.filter((p) => p.status === "available");
  if (available.length === 0) return;

  const message = available
    .map((p) => `${p.name} is now AVAILABLE!\n${p.url}\nPrice: ${p.priceJPY}`)
    .join("\n\n");
  bot.sendMessage(chatId, message);
};
