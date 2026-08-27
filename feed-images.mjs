function decodeImageEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function attribute(tag = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag).match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i"));
  return decodeImageEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

export function sanitizeFeedImageUrl(value = "") {
  let candidate = decodeImageEntities(value);
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (!candidate || candidate.length > 4096) return "";

  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function extractFeedImage(item = "") {
  const raw = decodeImageEntities(item);
  const mediaTags = [
    ...raw.matchAll(/<media:content\b[^>]*>/gi),
    ...raw.matchAll(/<media:thumbnail\b[^>]*>/gi)
  ];

  for (const match of mediaTags) {
    const image = sanitizeFeedImageUrl(attribute(match[0], "url"));
    if (image) return image;
  }

  for (const match of raw.matchAll(/<enclosure\b[^>]*>/gi)) {
    const type = attribute(match[0], "type").toLowerCase();
    const url = attribute(match[0], "url");
    if (type.startsWith("image/") || /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url)) {
      const image = sanitizeFeedImageUrl(url);
      if (image) return image;
    }
  }

  const itemImage = raw.match(/<image(?:\s[^>]*)?>([\s\S]*?)<\/image>/i)?.[1] || "";
  const directImage = sanitizeFeedImageUrl(itemImage.replace(/<[^>]*>/g, "").trim());
  if (directImage) return directImage;

  for (const match of raw.matchAll(/<img\b[^>]*>/gi)) {
    const image = sanitizeFeedImageUrl(
      attribute(match[0], "data-src") ||
      attribute(match[0], "data-original") ||
      attribute(match[0], "src")
    );
    if (image) return image;
  }

  return "";
}
