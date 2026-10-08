import sanitizeHtml from "sanitize-html";

// Only allow the tags our editor can produce. Everything else is stripped.
export function cleanHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "s", "h2", "h3",
      "ul", "ol", "li", "blockquote", "code", "pre", "a", "hr",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Plain-text preview used in lists and meta descriptions
export function makeExcerpt(html: string, max = 160) {
  const text = decodeEntities(
    sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}