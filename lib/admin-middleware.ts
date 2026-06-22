import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin";

type AdminHandler<T extends unknown[] = unknown[]> = (
  ...args: T
) => Promise<NextResponse>;

export function withAdmin<T extends unknown[]>(handler: AdminHandler<T>): AdminHandler<T> {
  return async (...args: T) => {
    if (!(await verifyAdmin())) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return handler(...args);
  };
}
