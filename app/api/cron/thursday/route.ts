import { NextResponse } from "next/server";
import { runWeeklyWorkflow } from "@/lib/workflow";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedAuth = `Bearer ${process.env.VERCEL_CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Weekly workflow triggered by cron");

  const result = await runWeeklyWorkflow();

  if (result.success) {
    console.log(`Workflow completed successfully: ${result.slug}`);
    return NextResponse.json({
      success: true,
      slug: result.slug,
    });
  } else {
    console.error(`Workflow failed: ${result.error}`);
    return NextResponse.json(
      {
        success: false,
        error: result.error,
      },
      { status: 500 }
    );
  }
}
