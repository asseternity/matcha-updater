import axios from "axios";
import * as cheerio from "cheerio";

export interface Product {
  name: string;
  url: string;
  status: "available" | "sold out";
  priceJPY?: string;
}

// List of URLs to scrape
const productUrls = [
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/principal",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1f62020c1-1f62200c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1f78020c1-1f78100c6",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/11c2020c1-11c2040c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/11b1100c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1142020c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1132020c1",
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/1182020c1",
];

export const scrapeProducts = async (): Promise<Product[]> => {
  const allProducts: Product[] = [];

  for (const url of productUrls) {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      // Case 1: Catalog page (multiple products)
      $("ul.products > li.product").each((_, el) => {
        const li = $(el);
        const name = li.find("div.product-name h4").text().trim();
        const prodUrl =
          li.find("a.woocommerce-loop-product__link").attr("href") || "";
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
        const name = $("h1.product_title").text().trim() || "Unknown product";

        formEl.find(".product-form-row").each((_, row) => {
          const rowEl = $(row);
          const sku = rowEl.find("dl.pa-sku dd").text().trim();
          const size = rowEl.find("dl.pa-size dd").text().trim();
          const priceJPY = rowEl
            .find(".woocs_price_JPY .woocommerce-Price-amount")
            .first()
            .text()
            .trim();

          // Stock: check single-stock-status in parent form
          const stockText = formEl
            .find(".stock.single-stock-status")
            .text()
            .toLowerCase();
          const status: "available" | "sold out" = stockText.includes(
            "out of stock"
          )
            ? "sold out"
            : "available";

          allProducts.push({
            name: `${name} (${size})`,
            url,
            status,
            priceJPY,
          });
        });
      });
    } catch (err) {
      console.error(`Error scraping ${url}:`, err);
    }
  }

  return allProducts;
};
