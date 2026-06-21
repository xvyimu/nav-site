import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => Promise<NextResponse>;

export function withAdmin(handler: Handler): Handler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    if (!(await verifyAdmin())) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return handler(...args);
  };
}
