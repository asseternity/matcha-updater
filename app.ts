// dependencies
import { scrapeProducts } from "./scraper";
import { notifyAvailable } from "./telegram";
import axios from "axios";
import cron from "node-cron";
import express, { Request, Response } from "express";
const app = express();

// setup
app.get("/", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

// test
app.get("/scrape", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

// run scraper every 6 hours
cron.schedule("0 */6 * * *", async () => {
  console.log("Running scraper at", new Date().toLocaleDateString());
  const products = await scrapeProducts();
  if (!products) return;
  products?.forEach((product) => {
    console.log(
      `${product.name} is ${product.status} | Price: ${product.priceJPY} JPY | Link: ${product.url}`
    );
  });
  // Notify Telegram if any product is available
  notifyAvailable(products);
});

// find chat id
import TelegramBot from "node-telegram-bot-api";
const bot = new TelegramBot(process.env.TG_BOT_TOKEN || "", { polling: true });
bot.on("message", (msg) => {
  console.log("Chat ID:", msg.chat.id);
  bot.stopPolling();
});

app.get("/get-chat-id", async (req: Request, res: Response) => {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) return res.status(500).send("TG_BOT_TOKEN not set");
  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${token}/getUpdates`
    );
    const updates = r.data.result || [];
    if (!updates.length)
      return res.json({ ok: true, message: "no updates yet" });
    const last = updates[updates.length - 1];
    return res.json({
      chatId: last.message?.chat?.id ?? null,
      lastUpdate: last,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("error fetching updates");
  }
});

// launch
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);
});
