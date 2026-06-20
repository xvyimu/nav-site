import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin";

type Handler = (request: Request, params?: any) => Promise<NextResponse>;

export function withAdmin(handler: Handler): Handler {
  return async (request: Request, params?: any) => {
    if (!(await verifyAdmin())) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return handler(request, params);
  };
}
