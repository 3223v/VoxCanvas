import { NextRequest, NextResponse } from 'next/server';
import { canvasService } from '@/lib/services/canvas-service';

export async function GET() {
  try {
    const list = await canvasService.list();
    return NextResponse.json({ data: list });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, state } = body;
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const canvas = await canvasService.create(title, state);
    return NextResponse.json({ data: canvas }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
