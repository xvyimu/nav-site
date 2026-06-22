import { NextResponse } from "next/server";
import { getCsrfToken } from "@/lib/csrf";
import { verifyAdmin } from "@/lib/admin";

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const token = await getCsrfToken();
  return NextResponse.json({ csrfToken: token });
}
