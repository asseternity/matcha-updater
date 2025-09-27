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

// launch
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);
});
