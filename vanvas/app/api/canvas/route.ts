import canvasService from "@/services/canvas.service";
import { NextRequest, NextResponse } from "next/server";

export function GET() {
  try {
    const canvases = canvasService.list();
    return NextResponse.json(canvases);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const canvas = canvasService.create({
      title: body.title,
      canvasWidth: body.canvasWidth,
      canvasHeight: body.canvasHeight,
      state: body.state,
    });
    return NextResponse.json(canvas, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
