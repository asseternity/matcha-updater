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
// scraper.ts
export const catalogUrls = [
  "https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/principal",
];

export const singleProductUrls = [
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

export const scrapePrincipalProducts = async (): Promise<Product[]> => {
  const principalProducts: Product[] = [];
  const url: string = catalogUrls[0];
  try {
    const { data } = await axiosInstance.get(url);
    const $ = cheerio.load(data);
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
      principalProducts.push({ name, url: prodUrl, status, priceJPY });
    });
  } catch (err) {
    console.error(`Error scraping catalog ${url}:`, err);
  }
  return principalProducts;
};

export const scrapeOtherProducts = async (): Promise<Product[]> => {
  const otherProducts: Product[] = [];
  for (const url of singleProductUrls) {
    try {
      const { data } = await axiosInstance.get(url);
      const $ = cheerio.load(data);

      $(".variations_form.cart").each((_, form) => {
        const formEl = $(form);
        const name =
          $("h1.product_title").first().text().trim() || "Unknown product";

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
          const size = rowEl.find("dl.pa-size dd").first().text().trim();
          const priceJPY = rowEl
            .find(".woocs_price_JPY .woocommerce-Price-amount")
            .first()
            .text()
            .trim();

          otherProducts.push({
            name: `${name}${size ? ` (${size})` : ""}`,
            url,
            status: formStatus,
            priceJPY,
          });
        });
      });
    } catch (err) {
      console.error(`Error scraping single product ${url}:`, err);
    }
  }
  return otherProducts;
};

export const scrapeAllProducts = async (): Promise<Product[]> => {
  const allProducts: Product[] = [];

  // scrape catalog pages
  for (const url of catalogUrls) {
    try {
      const { data } = await axiosInstance.get(url);
      const $ = cheerio.load(data);
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
    } catch (err) {
      console.error(`Error scraping catalog ${url}:`, err);
    }
  }

  // scrape single-product pages
  for (const url of singleProductUrls) {
    try {
      const { data } = await axiosInstance.get(url);
      const $ = cheerio.load(data);

      $(".variations_form.cart").each((_, form) => {
        const formEl = $(form);
        const name =
          $("h1.product_title").first().text().trim() || "Unknown product";

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
          const size = rowEl.find("dl.pa-size dd").first().text().trim();
          const priceJPY = rowEl
            .find(".woocs_price_JPY .woocommerce-Price-amount")
            .first()
            .text()
            .trim();

          allProducts.push({
            name: `${name}${size ? ` (${size})` : ""}`,
            url,
            status: formStatus,
            priceJPY,
          });
        });
      });
    } catch (err) {
      console.error(`Error scraping single product ${url}:`, err);
    }
  }

  // Deduplicate by key (url + name)
  const seen = new Set<string>();
  const unique: Product[] = [];
  for (const p of allProducts) {
    const key = `${p.url}|${p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  return unique;
};
