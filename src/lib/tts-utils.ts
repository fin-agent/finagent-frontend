/**
 * TTS (Text-to-Speech) formatting utilities for ElevenLabs
 *
 * ElevenLabs TTS works best when numbers are spelled out as words.
 * This follows ElevenLabs best practices documentation.
 *
 * @see https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
 */

import { toWords } from 'number-to-words';

/**
 * Format a currency value for TTS - converts to spoken words
 *
 * Examples:
 *   formatCurrencyForTTS(24094.50) → "twenty-four thousand ninety-four dollars and fifty cents"
 *   formatCurrencyForTTS(1000) → "one thousand dollars"
 *   formatCurrencyForTTS(-500.25) → "negative five hundred dollars and twenty-five cents"
 *   formatCurrencyForTTS(0) → "zero dollars"
 */
export function formatCurrencyForTTS(value: number): string {
  const absValue = Math.abs(value);
  const dollars = Math.floor(absValue);
  const cents = Math.round((absValue - dollars) * 100);
  const isNegative = value < 0;

  let result = '';
  if (isNegative) {
    result = 'negative ';
  }

  // Convert dollars to words
  const dollarsInWords = toWords(dollars);
  result += `${dollarsInWords} dollar${dollars !== 1 ? 's' : ''}`;

  // Add cents if present
  if (cents > 0) {
    const centsInWords = toWords(cents);
    result += ` and ${centsInWords} cent${cents !== 1 ? 's' : ''}`;
  }

  return result;
}

/**
 * Format a number for TTS - converts to spoken words
 *
 * Examples:
 *   formatNumberForTTS(1500) → "one thousand five hundred"
 *   formatNumberForTTS(42) → "forty-two"
 *   formatNumberForTTS(0) → "zero"
 */
export function formatNumberForTTS(num: number): string {
  return toWords(Math.round(num));
}

/**
 * Format a price/rate for TTS (like stock prices or premiums)
 *
 * Examples:
 *   formatPriceForTTS(350.50) → "three hundred fifty dollars and fifty cents"
 *   formatPriceForTTS(12.99) → "twelve dollars and ninety-nine cents"
 */
export function formatPriceForTTS(price: number): string {
  return formatCurrencyForTTS(price);
}

/**
 * Format a percentage for TTS
 *
 * Examples:
 *   formatPercentForTTS(15.5) → "fifteen point five percent"
 *   formatPercentForTTS(100) → "one hundred percent"
 */
export function formatPercentForTTS(percent: number): string {
  const wholePart = Math.floor(percent);
  const decimalPart = Math.round((percent - wholePart) * 10);

  if (decimalPart === 0) {
    return `${toWords(wholePart)} percent`;
  }

  return `${toWords(wholePart)} point ${toWords(decimalPart)} percent`;
}

/**
 * Format a count/quantity for TTS with proper pluralization
 *
 * Examples:
 *   formatCountForTTS(5, 'trade') → "five trades"
 *   formatCountForTTS(1, 'contract') → "one contract"
 *   formatCountForTTS(100, 'share') → "one hundred shares"
 */
export function formatCountForTTS(count: number, singular: string, plural?: string): string {
  const countInWords = toWords(Math.round(count));
  const noun = count === 1 ? singular : (plural || `${singular}s`);
  return `${countInWords} ${noun}`;
}
