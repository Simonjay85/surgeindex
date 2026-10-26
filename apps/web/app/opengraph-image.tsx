import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SurgeIndex — The internet's Top 10, updated every hour";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PLATFORMS: Array<[string, string]> = [
  ["Google", "#4c8dff"],
  ["YouTube", "#ff2d46"],
  ["Reddit", "#ff5a1f"],
  ["Hacker News", "#ff8a1f"],
  ["GitHub", "#3fdc7a"],
];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: "#06070a", backgroundImage: "radial-gradient(circle at 15% 10%, rgba(255,90,31,.38), transparent 45%), radial-gradient(circle at 90% 85%, rgba(139,107,255,.35), transparent 50%)", color: "#f4f1ea", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "70px 78px", fontFamily: "Georgia" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontFamily: "Arial", fontWeight: 700 }}>
        <span style={{ background: "linear-gradient(135deg,#ff5a1f,#ff2d6f,#8b6bff)", borderRadius: 12, width: 44, height: 44, display: "flex" }} />
        <span>SurgeIndex</span>
        <span style={{ marginLeft: 18, fontSize: 18, color: "#3fdc7a", letterSpacing: 3 }}>● LIVE · HOURLY</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 104, lineHeight: 1, letterSpacing: -3 }}>The internet&apos;s Top 10,</div>
        <div style={{ fontSize: 104, lineHeight: 1.05, letterSpacing: -3, fontStyle: "italic", color: "#ffb08a" }}>every hour.</div>
      </div>
      <div style={{ display: "flex", gap: 14, fontFamily: "Arial", fontSize: 22 }}>
        {PLATFORMS.map(([name, color]) => (
          <span key={name} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "10px 20px", color: "#e9e4da" }}>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: color, display: "flex" }} />
            {name}
          </span>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
