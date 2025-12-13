// API Route for Intent Classification
// Calls Azure OpenAI GPT for intent classification

import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/src/lib/intent-detection';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    const result = await classifyIntent(query);

    // Return result (null if no confident match)
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[classify-intent API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to classify intent' },
      { status: 500 }
    );
  }
}
