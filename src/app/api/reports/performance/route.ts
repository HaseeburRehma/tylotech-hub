import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getKpis } from "@/lib/data";
import { ReportDocument, type ReportProps } from "@/lib/pdf/report-document";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";

function formatKpi(unit: string, value: number) {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "ratio") return `${value.toFixed(1)}x`;
  if (unit === "percent") return `${value}%`;
  if (unit === "rank") return `#${value}`;
  return new Intl.NumberFormat("en").format(value);
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Real KPIs for this client (staff without a tenant get an empty report).
  const raw = await getKpis(user.client_id ?? null);
  const kpis = raw.map((k) => ({
    label: k.label,
    value: formatKpi(k.unit, k.value),
    delta: `${k.delta > 0 ? "+" : ""}${k.delta}%`,
    source: k.source,
  }));

  const props: ReportProps = {
    company: user.company ?? "TyloTech Client",
    brandColor: user.primaryColor ?? "#C9A84C",
    period: new Date().toLocaleDateString("en-DE", { month: "long", year: "numeric" }),
    generatedAt: new Date().toLocaleString("en-DE"),
    kpis,
  };

  const element = createElement(ReportDocument, props) as unknown as Parameters<
    typeof renderToBuffer
  >[0];

  let buffer: Awaited<ReturnType<typeof renderToBuffer>>;
  try {
    buffer = await renderToBuffer(element);
  } catch (err) {
    console.error("PDF report render failed:", err);
    return NextResponse.json({ error: "Could not generate the report." }, { status: 500 });
  }
  const filename = `${(props.company || "report").replace(/\s+/g, "-").toLowerCase()}-performance.pdf`;

  return new NextResponse(new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
