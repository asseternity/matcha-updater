// app.ts
import { scrapeProducts } from "./scraper";
import { notifyAvailable, initBot } from "./telegram";
import cron from "node-cron";
import express, { Request, Response } from "express";

const app = express();

// HTTP endpoints
app.get("/", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

app.get("/scrape", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

// In-memory state (resets on process restart)
let lastSentDateJST: string | null = null; // format: YYYY-MM-DD

const getTokyoDateString = (): string => {
  const tokyoNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  const y = tokyoNow.getFullYear();
  const m = String(tokyoNow.getMonth() + 1).padStart(2, "0");
  const d = String(tokyoNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Scheduler function (declared but started after server listen)
const startScheduler = () => {
  // every 30 minutes, Mon–Fri, 08:00–22:30 JST
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

        // Send if no message sent yet today, OR at least one product available now
        const shouldSend = lastSentDateJST !== todayJST || anyAvailable;

        console.log(
          `[scheduler] Tokyo date: ${todayJST} | available: ${anyAvailable} | lastSentDateJST: ${lastSentDateJST} | shouldSend: ${shouldSend}`
        );

        if (shouldSend) {
          try {
            await notifyAvailable(products);
            lastSentDateJST = todayJST;
            console.log(
              `[scheduler] Notification sent (Tokyo date ${todayJST}).`
            );
          } catch (err) {
            console.error("[scheduler] notifyAvailable error:", err);
          }
        } else {
          console.log("[scheduler] No notification sent this run.");
        }
      } catch (err) {
        console.error("[scheduler] error during scheduled scrape:", err);
      }
    },
    { timezone: "Asia/Tokyo" }
  );
};

// Start server first, then init bot + scheduler to avoid blocking startup
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);

  // Start bot after the server is listening
  const enablePolling = process.env.ENABLE_POLLING === "true";
  initBot(enablePolling);

  // Start scheduled jobs after server is ready
  startScheduler();
});

// catch unhandled rejections to avoid silent crashes
process.on("unhandledRejection", (r) => {
  console.error("Unhandled Rejection:", r);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // you might want to exit in severe cases: process.exit(1);
});
