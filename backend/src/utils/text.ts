import sanitizeHtml from 'sanitize-html';


/**
 * Санітизує HTML контент, дозволяє базові теги (потрібно для безпеки)
 */
export function sanitizeContent(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: {
      a: ['href', 'rel', 'target'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string | undefined>) => {
        const href = attribs.href ?? '';
        const relParts = (attribs.rel ?? '').split(/\s+/).filter(Boolean);
        if (!relParts.includes('noopener')) relParts.push('noopener');
        if (!relParts.includes('noreferrer')) relParts.push('noreferrer');
        const rel = relParts.join(' ');
        const target = attribs.target ?? '_blank';
        return {
          tagName: 'a',
          attribs: { href, rel, target },
        };
      },
    },
  });
}


/**
 * Повертає чистий текст з HTML (без тегів)
 */
export function stripHtml(html: string) {
  const cleaned = sanitizeContent(html);
  return cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}


/**
 * Рахує слова в HTML-контенті (після санітизації)
 */
export function countWordsFromHtml(html: string) {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}


/**
 * Короткий фрагмент тексту (excerpt)
 */
export function excerptFromHtml(html: string, maxLen = 200) {
  const text = stripHtml(html);
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
}