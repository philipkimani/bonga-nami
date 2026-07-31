/**
 * Lightweight Markdown Renderer for Chat Messages
 *
 * Supports a practical subset of markdown without external dependencies:
 * - **bold** and *italic*
 * - Unordered lists (- or *)
 * - Ordered lists (1. 2. 3.)
 * - `inline code`
 * - Line breaks (double newline = paragraph, single newline = <br>)
 * - Headings (## only — deeper levels for chat context)
 *
 * This is intentionally minimal to keep bundle size small for the widget.
 * Do NOT add a full markdown parser library for this use case.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface MarkdownRendererProps {
  content: string;
  isUser?: boolean;
}

type BlockNode =
  | { type: 'paragraph'; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'heading'; level: number; content: string };

// =============================================================================
// BLOCK PARSER — splits text into structural blocks
// =============================================================================

function parseBlocks(text: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading: ## or ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Unordered list: lines starting with - or *
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list: lines starting with 1. 2. etc.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      // Smart list detection: if 2+ lines and most contain " - " separators,
      // treat as a bullet list (common for LLM-generated product/package lists)
      if (paraLines.length >= 2) {
        const dashSepCount = paraLines.filter(l => / - /.test(l)).length;
        if (dashSepCount >= 2 && dashSepCount / paraLines.length >= 0.5) {
          blocks.push({ type: 'ul', items: paraLines.map(l => l.trim()) });
          continue;
        }
      }
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

// =============================================================================
// INLINE PARSER — handles bold, italic, code within text
// =============================================================================

function renderInline(text: string, isUser: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex matches: **bold**, *italic*, `code`, or $price patterns
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|((?<!\w)\$[\d,]+(?:\.\d+)?(?:\/\w+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      nodes.push(
        <strong key={match.index} style={{ fontWeight: 600 }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      nodes.push(
        <em key={match.index}>{match[4]}</em>
      );
    } else if (match[5]) {
      // `code`
      nodes.push(
        <code
          key={match.index}
          style={{
            padding: '1px 4px',
            borderRadius: '3px',
            backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // $price — auto-bold currency amounts
      nodes.push(
        <strong key={match.index} style={{ fontWeight: 600 }}>
          {match[7]}
        </strong>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

// =============================================================================
// BLOCK RENDERERS
// =============================================================================

function renderParagraph(content: string, isUser: boolean, key: number): React.ReactNode {
  // Handle single newlines as <br> within a paragraph
  const lines = content.split('\n');
  return (
    <p key={key} style={{ margin: '0 0 0.4em 0' }}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderInline(line, isUser)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </p>
  );
}

function renderUnorderedList(items: string[], isUser: boolean, key: number): React.ReactNode {
  return (
    <ul
      key={key}
      style={{
        margin: '0.3em 0',
        paddingLeft: '1.3em',
        listStyleType: 'disc',
      }}
    >
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: '0.2em' }}>
          {renderInline(item, isUser)}
        </li>
      ))}
    </ul>
  );
}

function renderOrderedList(items: string[], isUser: boolean, key: number): React.ReactNode {
  return (
    <ol
      key={key}
      style={{
        margin: '0.3em 0',
        paddingLeft: '1.3em',
      }}
    >
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: '0.2em' }}>
          {renderInline(item, isUser)}
        </li>
      ))}
    </ol>
  );
}

function renderHeading(content: string, level: number, isUser: boolean, key: number): React.ReactNode {
  const fontSize = level === 1 ? '1.1em' : level === 2 ? '1.05em' : '1em';
  return (
    <div
      key={key}
      style={{
        fontWeight: 600,
        fontSize,
        margin: '0.4em 0 0.2em 0',
      }}
    >
      {renderInline(content, isUser)}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MarkdownRenderer({ content, isUser = false }: MarkdownRendererProps) {
  // For very short or simple messages, skip parsing overhead
  const hasMarkdown = /[*`#\-]/.test(content) || content.includes('\n') || /\$\d/.test(content);

  if (!hasMarkdown) {
    return <>{content}</>;
  }

  const blocks = parseBlocks(content);

  return (
    <div style={{ margin: 0 }}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return renderParagraph(block.content, isUser, i);
          case 'ul':
            return renderUnorderedList(block.items, isUser, i);
          case 'ol':
            return renderOrderedList(block.items, isUser, i);
          case 'heading':
            return renderHeading(block.content, block.level, isUser, i);
          default:
            return null;
        }
      })}
    </div>
  );
}
