import { NextRequest, NextResponse } from "next/server";
import { getCVEByIdServer } from "@/lib/server-api";
import { generateCveInsight } from "@/lib/ai-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const detail = await getCVEByIdServer(decodeURIComponent(id));
    const insight = await generateCveInsight(detail);
    return NextResponse.json(insight);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate AI CVE insight" },
      { status: 500 }
    );
  }
}
