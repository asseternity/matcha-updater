// scraper.ts
import axios from "axios";
import * as cheerio from "cheerio";

export interface Product {
  name: string;
  url: string;
  status: "available" | "sold out";
  priceJPY?: string;
}

// List of URLs to scrape
export const productUrls = [
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/principal",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1f62020c1-1f62200c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1f78020c1-1f78100c6",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/11c2020c1-11c2040c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/11b1100c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1142020c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1132020c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1182020c1",
];

const axiosInstance = axios.create({
  timeout: 15000, // 15s timeout to avoid long blocking requests
  headers: {
    "User-Agent": "marukyu-scraper/1.0 (+https://your.domain/)",
  },
});

export const scrapeProducts = async (): Promise<Product[]> => {
  const allProducts: Product[] = [];

  for (const url of productUrls) {
    try {
      const { data } = await axiosInstance.get(url);
      const $ = cheerio.load(data);

      // Case 1: Catalog page (multiple products)
      $("ul.products > li.product").each((_, el) => {
        const li = $(el);
        const name = li.find("div.product-name h4").text().trim();
        const prodUrl =
          li.find("a.woocommerce-loop-product__link").attr("href") || url;
        const status = li.hasClass("outofstock") ? "sold out" : "available";
        const priceJPY = li
          .find("span.woocs_price_JPY .woocommerce-Price-amount")
          .first()
          .text()
          .trim();
        allProducts.push({ name, url: prodUrl, status, priceJPY });
      });

      // Case 2: Single-product pages (variations)
      $(".variations_form.cart").each((_, form) => {
        const formEl = $(form);
        const name =
          $("h1.product_title").first().text().trim() || "Unknown product";

        // stock paragraph can exist at form level (out-of-stock) OR be absent (available)
        const stockText = formEl
          .find(".stock.single-stock-status")
          .text()
          .toLowerCase();
        const formStatus: "available" | "sold out" = stockText.includes(
          "out of stock"
        )
          ? "sold out"
          : "available";

        formEl.find(".product-form-row").each((_, row) => {
          const rowEl = $(row);
          // better selectors: match dl where dt === 'SKU' etc, fallback to generic
          const sku = rowEl
            .find("dl.pa.pa-sku dd, dl.pa-sku dd, dl .pa-sku dd")
            .first()
            .text()
            .trim();
          const size = rowEl
            .find("dl.pa.pa-size dd, dl.pa-size dd, dl .pa-size dd")
            .first()
            .text()
            .trim();
          const priceJPY = rowEl
            .find(".woocs_price_JPY .woocommerce-Price-amount")
            .first()
            .text()
            .trim();

          const status = formStatus;

          allProducts.push({
            name: `${name}${size ? ` (${size})` : ""}`,
            url,
            status,
            priceJPY,
          });
        });
      });
    } catch (err) {
      console.error(`Error scraping ${url}:`, err);
      // continue to next URL
    }
  }

  return allProducts;
};
