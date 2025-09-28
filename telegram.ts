// telegram.ts
import TelegramBot from "node-telegram-bot-api";
import { scrapeProducts, Product } from "./scraper";

const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;

if (!token) console.error("TG_BOT_TOKEN missing. Telegram features disabled.");
if (!chatId)
  console.error("TG_CHAT_ID missing. Automatic notifications disabled.");

export const bot = new TelegramBot(token || "", { polling: !!token });

// Escape for MarkdownV2 (improved: same as before)
const escapeMdV2 = (s = "") =>
  s.replace(/([_*\[\]\(\)~`>#+=\-|{}.!])/g, "\\$1");

// Safely create a MarkdownV2 link; encode URL so parentheses/spaces don't break it.
// If url is empty, return plain escaped text.
const mkLink = (text: string, url?: string) => {
  const escText = escapeMdV2(text || "");
  if (!url) return escText;
  try {
    // encodeURI preserves valid URL characters but encodes parentheses/spaces etc.
    const safeUrl = encodeURI(url);
    return `[${escText}](${safeUrl})`;
  } catch {
    return escText;
  }
};

// Build the summary (one line per product). Use strings that are safe for MarkdownV2.
export const makeSummary = (
  products: Product[],
  mode: "automatic" | "requested"
) => {
  const total = products.length;
  const availableCount = products.filter(
    (p) => p.status === "available"
  ).length;
  const soldOutCount = total - availableCount;

  const header = mode === "automatic" ? "automatic update" : "requested update";
  const counts = `Total: ${total} • Available: ${availableCount} • Sold Out: ${soldOutCount}`;

  const lines = products.map((p) => {
    const name = p.name || "";
    const price = p.priceJPY || "";
    const url = p.url || "";
    const linkOrName = url ? mkLink(name, url) : escapeMdV2(name);
    return `${linkOrName} is ${escapeMdV2(p.status)} • Price: ${escapeMdV2(
      price
    )}`;
  });

  // join with newline; escape header but counts are plain numbers and bullets
  const parts = [escapeMdV2(header), counts, ...lines];
  return parts.join("\n");
};

// Split by whole-line boundaries into chunks <= limit (safe for links)
const splitMessageIntoChunks = (text: string, limit = 4000): string[] => {
  if (text.length <= limit) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";
  for (const ln of lines) {
    // +1 for the newline if cur not empty
    const wouldBe = cur.length === 0 ? ln.length : cur.length + 1 + ln.length;
    if (wouldBe > limit) {
      if (cur.length > 0) {
        chunks.push(cur);
      }
      // if single line is longer than limit, force-split it (very rare)
      if (ln.length > limit) {
        // split the long line into pieces
        let i = 0;
        while (i < ln.length) {
          const piece = ln.slice(i, i + limit);
          chunks.push(piece);
          i += limit;
        }
        cur = "";
      } else {
        cur = ln;
      }
    } else {
      cur = cur.length === 0 ? ln : cur + "\n" + ln;
    }
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
};

export const notifyAvailable = async (products: Product[]) => {
  try {
    if (!chatId) {
      console.error("notifyAvailable: TG_CHAT_ID not set — aborting notify.");
      return;
    }

    const text = makeSummary(products, "automatic");

    // split into safe chunks (keeping each chunk < ~4096); use 4000 to be conservative
    const chunks = splitMessageIntoChunks(text, 4000);

    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      });
    }

    console.log("notifyAvailable: summary sent (chunks:", chunks.length, ")");
  } catch (err: any) {
    // node-telegram-bot-api/HTTP libs normally put API error details into err.response or err.response.body
    const apiErr =
      err?.response?.body ||
      err?.response?.data ||
      err?.response ||
      err?.error ||
      err?.message ||
      err;
    console.error("notifyAvailable: sendMessage error:", apiErr);
  }
};

// command handler for /matcha (unchanged except better error logging)
bot.onText(/^\/matcha(?:\s+(.+))?$/i, async (msg, match) => {
  const chatIdLocal = msg.chat.id;
  try {
    await bot.sendMessage(
      chatIdLocal,
      "Running matcha scraper — please wait..."
    );
    const products = await scrapeProducts();
    if (!products) {
      await bot.sendMessage(chatIdLocal, "Scrape failed or returned no data.");
      return;
    }
    // prepare text and split identically to automatic
    const text = makeSummary(products, "requested");
    const chunks = splitMessageIntoChunks(text, 4000);
    for (const chunk of chunks) {
      await bot.sendMessage(chatIdLocal, chunk, {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      });
    }
  } catch (err: any) {
    console.error(
      "Error handling /matcha:",
      err?.response?.body || err?.message || err
    );
    await bot.sendMessage(chatIdLocal, "Error while scraping. Check logs.");
  }
});
