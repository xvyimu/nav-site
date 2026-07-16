import { NextResponse } from "next/server";

// Stripe Checkout - 暂未启用，留接口
export async function POST() {
  if (process.env.ENABLE_PAYMENTS_API !== "1") {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    { error: "付费功能即将上线，敬请期待" },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}
