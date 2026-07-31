/**
 * WhatsApp Extension - Test Suite
 * 
 * Basic tests for WhatsApp functionality
 */

import { describe, it, expect } from '@jest/globals';
import { 
  formatForWhatsApp, 
  splitLongMessage, 
  formatList,
  escapeWhatsApp 
} from '../src/formatter.js';

describe('WhatsApp Formatter', () => {
  describe('formatForWhatsApp', () => {
    it('should preserve basic markdown', () => {
      const input = '*bold* and _italic_ text';
      const output = formatForWhatsApp(input);
      expect(output).toBe('*bold* and _italic_ text');
    });

    it('should convert double asterisks to single', () => {
      const input = '**bold text**';
      const output = formatForWhatsApp(input);
      expect(output).toBe('*bold text*');
    });

    it('should strip markdown when requested', () => {
      const input = '*bold* and _italic_ and `code`';
      const output = formatForWhatsApp(input, false);
      expect(output).toBe('bold and italic and code');
    });

    it('should truncate very long messages', () => {
      const input = 'a'.repeat(5000);
      const output = formatForWhatsApp(input);
      expect(output.length).toBeLessThan(4100);
      expect(output.endsWith('...')).toBe(true);
    });

    it('should remove null characters', () => {
      const input = 'Hello\0World';
      const output = formatForWhatsApp(input);
      expect(output).toBe('HelloWorld');
    });
  });

  describe('splitLongMessage', () => {
    it('should not split short messages', () => {
      const input = 'Short message';
      const chunks = splitLongMessage(input);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Short message');
    });

    it('should split on paragraph boundaries', () => {
      const input = 'Paragraph 1\n\n' + 'a'.repeat(3000) + '\n\nParagraph 3';
      const chunks = splitLongMessage(input, 3500);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle very long paragraphs', () => {
      const input = 'a'.repeat(5000);
      const chunks = splitLongMessage(input, 1000);
      expect(chunks.length).toBeGreaterThan(3);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(1000);
      });
    });
  });

  describe('formatList', () => {
    it('should format bullet list', () => {
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const output = formatList(items);
      expect(output).toBe('• Item 1\n• Item 2\n• Item 3');
    });

    it('should format numbered list', () => {
      const items = ['First', 'Second', 'Third'];
      const output = formatList(items, true);
      expect(output).toBe('1. First\n2. Second\n3. Third');
    });
  });

  describe('escapeWhatsApp', () => {
    it('should remove control characters', () => {
      const input = 'Hello\x00\x01\x1FWorld';
      const output = escapeWhatsApp(input);
      expect(output).toBe('HelloWorld');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const output = escapeWhatsApp(input);
      expect(output).toBe('Hello World');
    });
  });
});
