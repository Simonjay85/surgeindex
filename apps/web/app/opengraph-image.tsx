import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SurgeIndex — the live leaderboard of internet attention";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: "#f4efe9", color: "#171614", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "72px 78px", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, fontWeight: 700 }}><span style={{ background: "#ef7359", borderRadius: 14, width: 42, height: 42, display: "flex" }} /><span>SurgeIndex</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}><div style={{ color: "#b85844", fontSize: 22, letterSpacing: 4, fontWeight: 700 }}>THE ORGANIC BOARD</div><div style={{ fontSize: 74, lineHeight: 1.04, fontWeight: 800, maxWidth: 930 }}>Watch websites go viral in real time.</div><div style={{ color: "#635e58", fontSize: 28 }}>Verified attention. Transparent ranking. Clearly separated sponsored reach.</div></div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#635e58", fontSize: 22 }}><span>Earn the rank. Buy the reach.</span><span>surgeindex.lol</span></div>
    </div>,
    { ...size },
  );
}
