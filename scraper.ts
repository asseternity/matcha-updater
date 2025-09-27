import axios from "axios";
import * as cheerio from "cheerio";

interface Product {
  name: string;
  url: string;
  status: "available" | "sold out";
  priceJPY?: string;
}

export const scrapeProducts = async () => {
  try {
    const { data } = await axios.get(
      "https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/principal"
    );
    const $ = cheerio.load(data);

    const products: Product[] = [];

    $("ul.products > li.product").each((_, element) => {
      const li = $(element);
      const name = li.find("div.product-name h4").text().trim();
      const url =
        li.find("a.woocommerce-loop-product__link").attr("href") || "";
      const status = li.hasClass("outofstock") ? "sold out" : "available";
      const priceJPY = li
        .find("span.woocs_price_JPY .woocommerce-Price-amount")
        .first()
        .text()
        .trim();
      products.push({ name, url, status, priceJPY });
    });

    return products;
  } catch (error) {
    console.error("Error scraping website:", error);
  }
};
