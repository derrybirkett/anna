import { NextResponse } from "next/server";
import { runWeeklyWorkflow } from "@/lib/workflow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");

  console.log("Test workflow triggered", topic ? `for topic: ${topic}` : "");

  const result = await runWeeklyWorkflow(topic || undefined);

  if (result.success) {
    return NextResponse.json({
      success: true,
      message: "Workflow completed successfully",
      slug: result.slug,
    });
  } else {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
      },
      { status: 500 }
    );
  }
}
