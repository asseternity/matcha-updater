// dependencies
import { scrapeProducts } from "./scraper";
import cron from "node-cron";
import express, { Request, Response } from "express";
const app = express();

// setup
app.get("/", async (req: Request, res: Response) => {
  const products = await scrapeProducts();
  res.json(products);
});

// test
app.get("/scrape", async (req, res) => {
  const products = await scrapeProducts();
  res.json(products);
});

// run scraper every 6 hours
cron.schedule("0 */6 * * *", async () => {
  console.log("Running scraper at", new Date().toLocaleDateString());
  const products = await scrapeProducts();
  products?.forEach((product) => {
    console.log(
      `${product.name} is ${product.status} | Price: ${product.priceJPY} JPY | Link: ${product.url}`
    );
  });
});

// launch
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);
});
