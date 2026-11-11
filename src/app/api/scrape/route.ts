import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

function parsePriceNumber(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    return Math.round(val);
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").replace(/[円￥\\~\-]/g, "").trim();
    const match = cleaned.match(/\d+/);
    if (match) {
      const num = Math.round(Number(match[0]));
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

function checkOffersAndPrice(item: Record<string, unknown>): number | null {
  if (!item || typeof item !== "object") return null;

  if ("offers" in item && item.offers) {
    const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
    for (const offer of offers) {
      if (offer && typeof offer === "object") {
        if ("price" in offer) {
          const parsed = parsePriceNumber(offer.price);
          if (parsed !== null) return parsed;
        }
        if ("lowPrice" in offer) {
          const parsed = parsePriceNumber(offer.lowPrice);
          if (parsed !== null) return parsed;
        }
      }
    }
  }

  if ("price" in item) {
    const parsed = parsePriceNumber(item.price);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractPriceFromJsonLd($: cheerio.CheerioAPI): number | null {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    try {
      const raw = $(script).html();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item) continue;
        if (item["@graph"] && Array.isArray(item["@graph"])) {
          for (const graphItem of item["@graph"]) {
            const price = checkOffersAndPrice(graphItem);
            if (price !== null) return price;
          }
        }
        const price = checkOffersAndPrice(item);
        if (price !== null) return price;
      }
    } catch {}
  }
  return null;
}

function extractPrice($: cheerio.CheerioAPI): number | null {
  const jsonLdPrice = extractPriceFromJsonLd($);
  if (jsonLdPrice !== null) return jsonLdPrice;

  const productPrice = $('meta[property="product:price:amount"]').attr("content");
  if (productPrice) {
    const parsed = parsePriceNumber(productPrice);
    if (parsed !== null) return parsed;
  }

  const twitterPrice = $('meta[name="twitter:data1"]').attr("content");
  if (twitterPrice) {
    const parsed = parsePriceNumber(twitterPrice);
    if (parsed !== null) return parsed;
  }

  const amazonOffscreen = $("span.a-price span.a-offscreen").first().text();
  if (amazonOffscreen) {
    const parsed = parsePriceNumber(amazonOffscreen);
    if (parsed !== null) return parsed;
  }

  const amazonOffscreenStandalone = $("span.a-offscreen").first().text();
  if (amazonOffscreenStandalone) {
    const parsed = parsePriceNumber(amazonOffscreenStandalone);
    if (parsed !== null) return parsed;
  }

  const amazonWhole = $("span.a-price-whole").first().text();
  if (amazonWhole) {
    const parsed = parsePriceNumber(amazonWhole);
    if (parsed !== null) return parsed;
  }

  const rakutenPrice2 = $("span.price2").first().text();
  if (rakutenPrice2) {
    const parsed = parsePriceNumber(rakutenPrice2);
    if (parsed !== null) return parsed;
  }

  const rakutenItemPrice = $("span.itemPrice").first().text();
  if (rakutenItemPrice) {
    const parsed = parsePriceNumber(rakutenItemPrice);
    if (parsed !== null) return parsed;
  }

  const rakutenDivPrice = $("div.price").first().text();
  if (rakutenDivPrice) {
    const parsed = parsePriceNumber(rakutenDivPrice);
    if (parsed !== null) return parsed;
  }

  const spanClassPriceElements = $('span[class*="price"]').toArray();
  for (const el of spanClassPriceElements) {
    const text = $(el).text();
    const parsed = parsePriceNumber(text);
    if (parsed !== null) return parsed;
  }

  const spanDataPrice = $("span[data-price]").first().attr("data-price");
  if (spanDataPrice) {
    const parsed = parsePriceNumber(spanDataPrice);
    if (parsed !== null) return parsed;
  }

  const divDataPrice = $("div[data-price]").first().attr("data-price");
  if (divDataPrice) {
    const parsed = parsePriceNumber(divDataPrice);
    if (parsed !== null) return parsed;
  }

  const inputPrice = $('input[name="price"]').first().attr("value");
  if (inputPrice) {
    const parsed = parsePriceNumber(inputPrice);
    if (parsed !== null) return parsed;
  }

  const itemPropPriceEl = $('[itemprop="price"]').first();
  if (itemPropPriceEl.length) {
    const content = itemPropPriceEl.attr("content");
    if (content) {
      const parsed = parsePriceNumber(content);
      if (parsed !== null) return parsed;
    }
    const text = itemPropPriceEl.text();
    if (text) {
      const parsed = parsePriceNumber(text);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function decodeHtml(buffer: ArrayBuffer, contentTypeHeader: string | null): string {
  let detectedCharset: string | null = null;

  if (contentTypeHeader) {
    const match = contentTypeHeader.match(/charset=([^;]+)/i);
    if (match?.[1]) {
      detectedCharset = match[1].trim().toLowerCase().replace(/['"]/g, "");
    }
  }

  const initialDecoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!detectedCharset) {
    const metaCharsetMatch = initialDecoded.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i);
    if (metaCharsetMatch?.[1]) {
      detectedCharset = metaCharsetMatch[1].trim().toLowerCase();
    } else {
      const httpEquivMatch = initialDecoded.match(
        /<meta[^>]+http-equiv=["']?content-type["']?[^>]+content=["'][^"']*charset=([^"'>\s;]+)/i
      );
      if (httpEquivMatch?.[1]) {
        detectedCharset = httpEquivMatch[1].trim().toLowerCase();
      }
    }
  }

  if (detectedCharset) {
    if (
      detectedCharset === "shift_jis" ||
      detectedCharset === "sjis" ||
      detectedCharset === "windows-31j" ||
      detectedCharset === "cp932" ||
      detectedCharset === "x-sjis"
    ) {
      try {
        return new TextDecoder("shift_jis").decode(buffer);
      } catch {}
    }
    if (
      detectedCharset === "euc-jp" ||
      detectedCharset === "eucjp" ||
      detectedCharset === "x-euc-jp"
    ) {
      try {
        return new TextDecoder("euc-jp").decode(buffer);
      } catch {}
    }
    if (detectedCharset === "utf-8" || detectedCharset === "utf8") {
      return initialDecoded;
    }
    try {
      return new TextDecoder(detectedCharset).decode(buffer);
    } catch {}
  }

  return initialDecoded;
}

function resolveUrl(urlStr: string, parsedUrl: URL): string {
  try {
    return new URL(urlStr, parsedUrl.origin).toString();
  } catch {
    return urlStr;
  }
}

function extractImageUrl($: cheerio.CheerioAPI, parsedUrl: URL): string {
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
  if (
    ogImage &&
    !ogImage.includes("captcha") &&
    !ogImage.includes("placeholder")
  ) {
    return resolveUrl(ogImage, parsedUrl);
  }

  const amazonSelectors = [
    "#landingImage",
    "img#landingImage",
    "[id*='landingImage']",
    "#imgBlkFront",
    "#main-image",
    "img#mainImage",
    "#mainImage",
    "#ebooks-img-canvas img",
    "#main-image-container img",
  ];
  for (const sel of amazonSelectors) {
    const el = $(sel).first();
    if (!el.length) continue;

    const oldHires = el.attr("data-old-hires")?.trim();
    if (oldHires) {
      return resolveUrl(oldHires, parsedUrl);
    }

    const dynamicImageRaw = el.attr("data-a-dynamic-image")?.trim();
    if (dynamicImageRaw) {
      try {
        const dynamicMap = JSON.parse(dynamicImageRaw);
        const keys = Object.keys(dynamicMap);
        if (keys.length > 0 && keys[0].trim()) {
          return resolveUrl(keys[0].trim(), parsedUrl);
        }
      } catch {}
    }

    const src = el.attr("src")?.trim();
    if (src && !src.startsWith("data:")) {
      return resolveUrl(src, parsedUrl);
    }
  }

  const dynamicImg = $("img[data-a-dynamic-image]").first();
  if (dynamicImg.length) {
    const raw = dynamicImg.attr("data-a-dynamic-image")?.trim();
    if (raw) {
      try {
        const map = JSON.parse(raw);
        const keys = Object.keys(map);
        if (keys.length > 0 && keys[0].trim()) {
          return resolveUrl(keys[0].trim(), parsedUrl);
        }
      } catch {}
    }
  }

  const oldHiresImg = $("img[data-old-hires]").first();
  if (oldHiresImg.length) {
    const hires = oldHiresImg.attr("data-old-hires")?.trim();
    if (hires) {
      return resolveUrl(hires, parsedUrl);
    }
  }

  const twitterImage = $('meta[name="twitter:image"]').attr("content")?.trim();
  if (twitterImage) {
    return resolveUrl(twitterImage, parsedUrl);
  }

  const genericSelectors = [
    ".product-image img",
    ".main-image img",
    "article img",
  ];

  for (const sel of genericSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const src = el.attr("src")?.trim();
      if (src && !src.startsWith("data:")) {
        return resolveUrl(src, parsedUrl);
      }
    }
  }

  return "";
}

function extractTitle($: cheerio.CheerioAPI, isAmazon: boolean): string {
  if (isAmazon) {
    const amazonTitle = $("span#productTitle").first().text().trim();
    if (amazonTitle) return amazonTitle;
  }

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  if (ogTitle) return ogTitle;

  const amazonTitleFallback = $("span#productTitle").first().text().trim();
  if (amazonTitleFallback) return amazonTitleFallback;

  const pageTitle = $("title").first().text().trim();
  return pageTitle || "";
}

const WHITELIST_DOMAINS = [
  "amazon.co.jp",
  "amazon.com",
  "amzn.asia",
  "amzn.to",
  "zozo.jp",
  "rakuten.co.jp",
  "shopping.yahoo.co.jp",
  "yahoo.co.jp",
  "jp.mercari.com",
  "mercari.com",
  "uniqlo.com",
  "gu-global.com",
  "muji.com",
  "yodobashi.com",
  "biccamera.com",
];

function isWhitelistedDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return WHITELIST_DOMAINS.some(
    (domain) => host === domain || host.endsWith("." + domain)
  );
}

async function checkSafeBrowsing(
  targetUrl: string,
  hostname: string
): Promise<boolean> {
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost.includes("testing.google.test") ||
    lowerHost.includes("testsafebrowsing.appspot.com")
  ) {
    return false;
  }

  const apiKey =
    process.env.GOOGLE_SAFE_BROWSING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_SAFE_BROWSING_API_KEY ||
    process.env.SAFE_BROWSING_API_KEY;

  if (!apiKey) return true;

  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client: {
          clientId: "wishhub",
          clientVersion: "1.0.0",
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: targetUrl }],
        },
      }),
    });

    if (!res.ok) {
      return true;
    }

    const data = await res.json();
    if (
      data?.matches &&
      Array.isArray(data.matches) &&
      data.matches.length > 0
    ) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const rawUrl = body?.url ?? body?.productUrl ?? body?.product_url ?? "";

    if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
      return NextResponse.json(
        {
          title: "",
          imageUrl: "",
          siteName: "",
          productUrl: "",
          price: null,
        },
        { status: 200 }
      );
    }

    let trimmed = rawUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return NextResponse.json(
        {
          title: "",
          imageUrl: "",
          siteName: "",
          productUrl: rawUrl.trim(),
          price: null,
        },
        { status: 200 }
      );
    }

    const isWhitelisted = isWhitelistedDomain(parsedUrl.hostname);

    if (!isWhitelisted) {
      const isSafe = await checkSafeBrowsing(
        parsedUrl.toString(),
        parsedUrl.hostname
      );
      if (!isSafe) {
        return NextResponse.json(
          { error: "セキュリティ上の懸念があるため、このURLは登録できません" },
          { status: 400 }
        );
      }
    }

    const isAmazon = /amazon\.(co\.jp|com)/i.test(parsedUrl.hostname);
    const inferredSiteName = parsedUrl.hostname.replace(/^www\./i, "");

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "max-age=0",
          "Sec-Ch-Ua":
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          Referer: "https://www.google.co.jp/",
        },
      });
    } catch {
      return NextResponse.json(
        {
          title: inferredSiteName,
          imageUrl: "",
          siteName: inferredSiteName,
          productUrl: parsedUrl.toString(),
          price: null,
        },
        { status: 200 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          title: inferredSiteName,
          imageUrl: "",
          siteName: inferredSiteName,
          productUrl: parsedUrl.toString(),
          price: null,
        },
        { status: 200 }
      );
    }

    try {
      const arrayBuffer = await response.arrayBuffer();
      const contentTypeHeader = response.headers.get("content-type");
      const html = decodeHtml(arrayBuffer, contentTypeHeader);
      const $ = cheerio.load(html);

      const rawTitle = extractTitle($, isAmazon);
      const title =
        rawTitle && !/robot\s*check/i.test(rawTitle)
          ? rawTitle
          : inferredSiteName;

      const imageUrl = extractImageUrl($, parsedUrl);

      const ogSiteName = $('meta[property="og:site_name"]')
        .attr("content")
        ?.trim();
      const siteName = ogSiteName || inferredSiteName;

      const price = extractPrice($);

      return NextResponse.json(
        {
          title,
          imageUrl,
          siteName,
          productUrl: parsedUrl.toString(),
          price,
        },
        { status: 200 }
      );
    } catch {
      return NextResponse.json(
        {
          title: inferredSiteName,
          imageUrl: "",
          siteName: inferredSiteName,
          productUrl: parsedUrl.toString(),
          price: null,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "予期しないエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
