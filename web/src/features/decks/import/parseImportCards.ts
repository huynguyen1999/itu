import type { ParsedCard } from './importTypes';
import { createClientId } from '@/shared/browser/createClientId';

export function parseDelimitedText(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let currentVal = '';
  let insideQuote = false;
  let currentRow: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.some((cell) => cell !== '')) rows.push(currentRow);
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((cell) => cell !== '')) rows.push(currentRow);
  }

  return rows;
}

export function detectDelimiter(text: string): string {
  const commas = (text.match(/,/g) || []).length;
  const tabs = (text.match(/\t/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas && semicolons > tabs) return ';';
  return ',';
}

export function mapRowsToCards(rows: string[][]): ParsedCard[] {
  if (rows.length === 0) return [];

  let qIdx = 0;
  let aIdx = 1;
  let dateIdx = -1;
  let reverseIdx = -1;
  let startRow = 0;

  const firstRow = rows[0].map((cell) => String(cell || '').toLowerCase());
  const matchesHeader = firstRow.some((cell) =>
    ['question', 'prompt', 'front', 'answer', 'definition', 'back', 'due', 'review', 'reverse'].some((term) =>
      cell.includes(term),
    ),
  );

  if (matchesHeader) {
    startRow = 1;
    firstRow.forEach((cell, idx) => {
      if (cell.includes('question') || cell.includes('prompt') || cell.includes('front')) {
        qIdx = idx;
      } else if (cell.includes('answer') || cell.includes('definition') || cell.includes('back')) {
        aIdx = idx;
      } else if (cell.includes('due') || cell.includes('review') || cell.includes('date')) {
        dateIdx = idx;
      } else if (cell.includes('reverse')) {
        reverseIdx = idx;
      }
    });
  }

  return rows.slice(startRow).flatMap((row) => {
    if (row.length === 0) return [];

    const question = row[qIdx] || '';
    const answer = row[aIdx] || '';
    const nextReviewDate = parseOptionalDate(dateIdx !== -1 ? row[dateIdx] : '');
    const generateReverse = reverseIdx !== -1 ? parseBoolean(row[reverseIdx]) : false;

    return [
      {
        id: createClientId(),
        question,
        answer,
        nextReviewDate,
        generateReverse,
        errors: validateImportedCard(question, answer),
      },
    ];
  });
}

export function parseJsonCards(value: unknown): ParsedCard[] {
  const rawItems = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.items) ? value.items : [];
  return rawItems.map((item) => {
    const record = isRecord(item) ? item : {};
    const question = stringValue(record.question) || stringValue(record.prompt) || stringValue(record.front);
    const answer = stringValue(record.answer) || stringValue(record.definition) || stringValue(record.back);
    const nextReviewDate = parseOptionalDate(record.nextReviewDate ?? record.dueAt ?? record.due);
    const generateReverse = Boolean(record.generateReverse || record.reverse);

    return {
      id: createClientId(),
      question,
      answer,
      nextReviewDate,
      generateReverse,
      errors: validateImportedCard(question, answer),
    };
  });
}

export function parsePastedCards(text: string): ParsedCard[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonCards(JSON.parse(trimmed));
  }

  return mapRowsToCards(parseDelimitedText(trimmed, detectDelimiter(trimmed)));
}

export function validateImportedCard(question: string, answer: string): string[] {
  const errors: string[] = [];
  if (!question.trim()) errors.push('Question is required');
  if (!answer.trim()) errors.push('Answer is required');
  return errors;
}

function parseOptionalDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function parseBoolean(value: unknown): boolean {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
