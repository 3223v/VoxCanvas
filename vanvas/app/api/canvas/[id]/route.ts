import canvasService from "@/services/canvas.service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const canvas = canvasService.getById(id);
    if (!canvas) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(canvas);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const canvas = canvasService.update(id, {
      title: body.title,
      state: body.state,
      version: body.version,
      thumbnail: body.thumbnail,
      canvasWidth: body.canvasWidth,
      canvasHeight: body.canvasHeight,
    });
    if (!canvas) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(canvas);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    canvasService.delete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
