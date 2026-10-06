import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Lives in src/ on purpose: with a src/app directory Next.js only runs
// src/middleware.ts — a root-level middleware.ts is silently ignored.

// Dev only: the mobile app's web preview (Expo, localhost:8081) calls this API
// cross-origin. Native apps aren't subject to CORS, so production stays closed.
const DEV_APP_ORIGINS = new Set(["http://localhost:8081", "http://127.0.0.1:8081"]);

function devCors(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || !request.nextUrl.pathname.startsWith("/api/")) return null;
  const origin = request.headers.get("origin");
  if (!origin || !DEV_APP_ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export async function middleware(request: NextRequest) {
  const cors = devCors(request);
  if (cors && request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
  const response = await updateSession(request);
  if (cors) for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets & images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
