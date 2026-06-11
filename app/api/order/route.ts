import { NextRequest, NextResponse } from 'next/server';
import { getOrderForSession } from '@/lib/tools';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  return NextResponse.json(getOrderForSession(sessionId));
}
