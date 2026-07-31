/**
 * WhatsApp Extension - Message Formatter
 * 
 * Formats messages for WhatsApp's specific requirements and limitations.
 */

const MAX_WHATSAPP_MESSAGE_LENGTH = 4096;
const SAFE_MESSAGE_LENGTH = 4000; // Leave room for formatting

/**
 * Format text for WhatsApp
 * 
 * WhatsApp supports limited markdown:
 * - *bold*
 * - _italic_
 * - ~strikethrough~
 * - ```code```
 * 
 * @param text - Text to format
 * @param preserveMarkdown - Whether to keep basic markdown (default: true)
 * @returns Formatted text safe for WhatsApp
 */
export function formatForWhatsApp(
  text: string,
  preserveMarkdown: boolean = true
): string {
  let formatted = text;

  if (!preserveMarkdown) {
    // Strip all markdown formatting
    formatted = formatted
      .replace(/[*_`~]/g, '')
      .replace(/\n{3,}/g, '\n\n'); // Reduce excessive newlines
  } else {
    // Keep WhatsApp-compatible markdown, fix common issues
    // Convert ** to * (WhatsApp uses single asterisk for bold)
    formatted = formatted.replace(/\*\*/g, '*');
    
    // Convert __ to _ (WhatsApp uses single underscore for italic)
    formatted = formatted.replace(/__/g, '_');
    
    // Clean up triple backticks (convert to single)
    formatted = formatted.replace(/```(\w+)?\n/g, '```\n');
  }

  // Truncate if too long
  if (formatted.length > SAFE_MESSAGE_LENGTH) {
    formatted = formatted.slice(0, SAFE_MESSAGE_LENGTH) + '...';
  }

  // Remove any null characters or other problematic characters
  formatted = formatted.replace(/\0/g, '');

  return formatted.trim();
}

/**
 * Split long messages into WhatsApp-safe chunks
 * 
 * @param text - Text to split
 * @param maxLength - Maximum length per chunk (default: 4000)
 * @returns Array of message chunks
 */
export function splitLongMessage(
  text: string,
  maxLength: number = SAFE_MESSAGE_LENGTH
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If single paragraph is too long, split by sentences
      if (paragraph.length > maxLength) {
        const sentences = paragraph.split('. ');
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence + '. ';
          } else {
            currentChunk += sentence + '. ';
          }
        }
      } else {
        currentChunk = paragraph + '\n\n';
      }
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Format a link for WhatsApp
 * 
 * @param url - URL to format
 * @param text - Optional link text
 * @returns Formatted link
 */
export function formatLink(url: string, text?: string): string {
  if (text) {
    return `${text}: ${url}`;
  }
  return url;
}

/**
 * Format a list for WhatsApp
 * 
 * @param items - List items
 * @param numbered - Whether to use numbered list (default: false)
 * @returns Formatted list
 */
export function formatList(items: string[], numbered: boolean = false): string {
  return items
    .map((item, index) => {
      const prefix = numbered ? `${index + 1}. ` : '• ';
      return `${prefix}${item}`;
    })
    .join('\n');
}

/**
 * Escape special characters for WhatsApp
 * 
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeWhatsApp(text: string): string {
  // WhatsApp doesn't require much escaping, but clean up problematic chars
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .trim();
}
