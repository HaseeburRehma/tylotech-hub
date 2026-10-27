import { ImageResponse } from "next/og";
import { TYLOTECH_GOLD } from "@/lib/theme/themes";

// Link previews (WhatsApp, Slack, LinkedIn, iMessage …) for tylohq.de.
export const runtime = "edge";
export const alt = "TyloHQ: the client portal and command center by TyloTech";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = TYLOTECH_GOLD;

/** The TyloTech block mark (same geometry as app/icon.svg), scaled. */
function Mark({ s }: { s: number }) {
  const u = s / 40;
  const blocks: [number, number, number][] = [
    [6, 22, 0.45],
    [6, 14, 0.65],
    [14, 14, 0.85],
    [14, 6, 1],
    [22, 6, 0.65],
  ];
  return (
    <div style={{ width: s, height: s, borderRadius: 10 * u, background: "#181612", position: "relative", display: "flex", border: "2px solid rgba(201,168,76,0.25)" }}>
      {blocks.map(([x, y, o], i) => (
        <div key={i} style={{ position: "absolute", left: x * u, top: y * u, width: 7 * u, height: 7 * u, borderRadius: 1.5 * u, background: GOLD, opacity: o }} />
      ))}
    </div>
  );
}

export default function OpenGraphImage() {
  const chips = ["Leads", "KPIs", "Chat", "Prozesse", "Berichte", "AI-Tools"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#0B0A08",
          backgroundImage: "radial-gradient(circle at 85% 15%, rgba(201,168,76,0.22), transparent 45%), radial-gradient(circle at 10% 110%, rgba(201,168,76,0.12), transparent 40%)",
          color: "#F4EFE4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Mark s={84} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>TyloHQ</div>
            <div style={{ fontSize: 22, color: GOLD, letterSpacing: 4, textTransform: "uppercase" }}>by TyloTech</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
            <span>Dein Marketing. Deine Leads.</span>
            <span style={{ color: GOLD }}>Ein Portal.</span>
          </div>
          <div style={{ fontSize: 28, color: "#B8B0A0", maxWidth: 960 }}>Client portal & command center: live KPIs, every lead from Meta & Google, chat and monthly reports.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {chips.map((c) => (
              <div key={c} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(201,168,76,0.45)", color: "#EDE3C8", fontSize: 22, background: "rgba(201,168,76,0.08)" }}>
                {c}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 26, color: GOLD, fontWeight: 600 }}>tylohq.de</div>
        </div>
      </div>
    ),
    size,
  );
}
