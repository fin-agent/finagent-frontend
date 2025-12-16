// API Route for Intent Classification
// Calls Azure OpenAI GPT for intent classification

import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/src/lib/intent-detection';

function getSafeErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const e = error as {
    message?: unknown;
    name?: unknown;
    status?: unknown;
    code?: unknown;
    error?: unknown;
  };

  const details: Record<string, unknown> = {};

  if (typeof e.name === 'string') details.name = e.name;
  if (typeof e.message === 'string') details.message = e.message;
  if (typeof e.status === 'number') details.upstreamStatus = e.status;
  if (typeof e.code === 'string' || typeof e.code === 'number') details.code = e.code;

  if (e.error && typeof e.error === 'object') {
    const upstream = e.error as { message?: unknown; code?: unknown };
    if (typeof upstream.message === 'string') details.upstreamMessage = upstream.message;
    if (typeof upstream.code === 'string' || typeof upstream.code === 'number') details.upstreamCode = upstream.code;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { query, currentDate, timezone } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // Pass date context to the classifier for smart day-of-week interpretation
    const result = await classifyIntent(query, {
      currentDate: currentDate || new Date().toISOString(),
      timezone: timezone,
    });

    // Return result (null if no confident match)
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[classify-intent API] Error:', error);

    const isDev = process.env.NODE_ENV !== 'production';
    const details = isDev
      ? {
          ...getSafeErrorDetails(error),
          azure: {
            endpoint: process.env.AZURE_OPENAI_ENDPOINT || '(not set)',
            model: process.env.AZURE_OPENAI_MODEL || '(not set)',
            apiKeyPresent: Boolean(process.env.AZURE_OPENAI_API_KEY?.trim()),
          },
        }
      : undefined;
    const upstreamStatus =
      typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : undefined;

    return NextResponse.json(
      { error: 'Failed to classify intent', ...(details ? { details } : {}) },
      { status: upstreamStatus ? 502 : 500 }
    );
  }
}
