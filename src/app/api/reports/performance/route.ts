import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ReportDocument, type ReportProps } from "@/lib/pdf/report-document";
import { kpisFor } from "@/lib/mock/data";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";

function formatKpi(unit: string, value: number) {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "ratio") return `${value.toFixed(1)}x`;
  if (unit === "percent") return `${value}%`;
  return new Intl.NumberFormat("en").format(value);
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const kpis = kpisFor(user.client_id ?? "nordic").map((k) => ({
    label: k.label,
    value: formatKpi(k.unit, k.value),
    delta: `${k.delta > 0 ? "+" : ""}${k.delta}%`,
  }));

  const props: ReportProps = {
    company: user.company ?? "TyloTech Client",
    brandColor: user.primaryColor ?? "#C9A84C",
    period: new Date().toLocaleDateString("en-DE", { month: "long", year: "numeric" }),
    generatedAt: new Date().toLocaleString("en-DE"),
    kpis,
    channels: [
      { name: "Meta Ads", spend: "€18,400", leads: "198", cpl: "€52", roas: "4.9x" },
      { name: "Google Ads", spend: "€13,600", leads: "102", cpl: "€58", roas: "4.2x" },
      { name: "SEO", spend: "€4,200", leads: "34", cpl: "€41", roas: "6.1x" },
      { name: "Email", spend: "€1,800", leads: "8", cpl: "€38", roas: "5.4x" },
    ],
  };

  const element = createElement(ReportDocument, props) as unknown as Parameters<
    typeof renderToBuffer
  >[0];
  const buffer = await renderToBuffer(element);
  const filename = `${(props.company || "report").replace(/\s+/g, "-").toLowerCase()}-performance.pdf`;

  return new NextResponse(new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
