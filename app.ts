import { scrapeProducts, Product } from "./scraper";
import { notifyAvailable } from "./telegram";
import cron from "node-cron";
import express, { Request, Response } from "express";
const app = express();

// HTTP endpoint for testing the scraping
app.get("/scrape", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

// In-memory state (resets on process restart)
let lastSentDateJST: string | null = null; // format: YYYY-MM-DD

// Helper: current Tokyo date string
const getTokyoDateString = (): string => {
  const tokyoNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  const y = tokyoNow.getFullYear();
  const m = String(tokyoNow.getMonth() + 1).padStart(2, "0");
  const d = String(tokyoNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Scheduler: every 30 minutes, Mon–Fri, 08:00–22:30 JST
cron.schedule(
  "0,30 8-22 * * 1-5",
  async () => {
    try {
      const products = await scrapeProducts();
      if (!products || products.length === 0) {
        console.log("[scheduler] scrape returned no products.");
        return;
      }

      const todayJST = getTokyoDateString();
      const anyAvailable = products.some((p) => p.status === "available");

      // Send if:
      // - No message sent yet today, OR
      // - At least one product is available right now
      const shouldSend = lastSentDateJST !== todayJST || anyAvailable;

      console.log(
        `[scheduler] Tokyo date: ${todayJST} | available: ${anyAvailable} | lastSentDateJST: ${lastSentDateJST} | shouldSend: ${shouldSend}`
      );

      if (shouldSend) {
        await notifyAvailable(products);
        lastSentDateJST = todayJST;
        console.log(`[scheduler] Notification sent (Tokyo date ${todayJST}).`);
      } else {
        console.log("[scheduler] No notification sent this run.");
      }
    } catch (err) {
      console.error("[scheduler] error during scheduled scrape:", err);
    }
  },
  {
    timezone: "Asia/Tokyo",
  }
);

// launch
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);
});
