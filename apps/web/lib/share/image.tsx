/**
 * JSX for the 1080×1350 share image, rendered by next/og (Satori). Only flexbox
 * and inline styles. Fonts are the self-hosted Be Vietnam Pro TTFs in
 * apps/web/assets/fonts (full Vietnamese coverage; the VPS cannot reach Google Fonts).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { clipTitle, imageSafeText, SHARE_SIZE, vnDateLine, vnTime, type ShareData } from "./top10";

export const SHARE_FONT_FAMILY = "Be Vietnam Pro";

type FontWeight = 400 | 600 | 800;
const FONT_FILES: Array<[FontWeight, string]> = [
  [400, "BeVietnamPro-Regular.ttf"],
  [600, "BeVietnamPro-SemiBold.ttf"],
  [800, "BeVietnamPro-ExtraBold.ttf"],
];

/** apps/web/assets/fonts, resolved from the repo root (scripts) or apps/web (Next server). */
export function shareFontsDir(cwd = process.cwd()): string {
  const fromRoot = path.join(cwd, "apps", "web", "assets", "fonts");
  if (existsSync(fromRoot)) return fromRoot;
  return path.join(cwd, "assets", "fonts");
}

let fontCache: Promise<Array<{ name: string; data: ArrayBuffer; weight: FontWeight; style: "normal" }>> | null = null;

export function loadShareFonts() {
  fontCache ??= Promise.all(
    FONT_FILES.map(async ([weight, file]) => {
      const buf = await readFile(path.join(shareFontsDir(), file));
      return { name: SHARE_FONT_FAMILY, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
    }),
  ).catch((e: unknown) => {
    fontCache = null;
    throw e;
  });
  return fontCache;
}

const INK = "#f4f1ea";
const DIM = "rgba(244,241,234,.62)";
const LINE = "rgba(255,255,255,.10)";

function Logo() {
  return (
    <div style={{ display: "flex", width: 52, height: 52, borderRadius: 15, backgroundImage: "linear-gradient(45deg,#ff5a1f,#ff2d6f 55%,#8b6bff)", alignItems: "center", justifyContent: "center" }}>
      <svg width="34" height="34" viewBox="0 0 32 32">
        <path d="M5 22.5 11.2 16l4.3 4L25 9.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="9.5" r="2.6" fill="#fff" />
      </svg>
    </div>
  );
}

export function ShareImage({ data }: { data: ShareData }) {
  const { def, board, items, at } = data;
  const accent = def.color;
  return (
    <div
      style={{
        width: SHARE_SIZE.width,
        height: SHARE_SIZE.height,
        display: "flex",
        flexDirection: "column",
        background: "#06070a",
        backgroundImage: `radial-gradient(circle at 12% 6%, rgba(255,90,31,.34), transparent 42%), radial-gradient(circle at 96% 92%, rgba(139,107,255,.32), transparent 48%)`,
        color: INK,
        fontFamily: SHARE_FONT_FAMILY,
        padding: "60px 64px 52px",
      }}
    >
      {/* brand row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Logo />
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>SurgeIndex</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, border: `2px solid ${accent}`, borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 600, color: accent }}>
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 99, background: accent }} />
          {def.short}
        </div>
      </div>

      {/* title */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <span style={{ fontSize: 26, fontWeight: 600, color: "#ffb08a", letterSpacing: 1 }}>{vnDateLine(at)}</span>
        <span style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, marginTop: 10 }}>{def.title[0]}</span>
        <span style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, color: "#ffb08a" }}>{def.title[1]}</span>
      </div>

      {/* list */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 34, flexGrow: 1, borderTop: `2px solid ${LINE}` }}>
        {items.length ? (
          items.map((item) => {
            const metric = board ? def.metric(item, board) : null;
            const podium = item.rank <= 3;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", height: 79, borderBottom: `2px solid ${LINE}`, gap: 22 }}>
                <span style={{ display: "flex", width: 64, justifyContent: "flex-end", fontSize: podium ? 46 : 38, fontWeight: 800, color: podium ? accent : "rgba(244,241,234,.45)", letterSpacing: -1 }}>{item.rank}</span>
                {def.twoLine ? (
                  <span style={{ display: "block", flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, fontSize: 26, lineHeight: 1.28, fontWeight: 600, overflow: "hidden", lineClamp: 2 }}>{imageSafeText(clipTitle(item.title, 120))}</span>
                ) : (
                  <span style={{ display: "flex", flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, fontSize: 33, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{imageSafeText(clipTitle(item.title, 80))}</span>
                )}
                {metric ? <span style={{ display: "flex", flexShrink: 0, fontSize: 22, fontWeight: 400, color: DIM }}>{metric}</span> : null}
              </div>
            );
          })
        ) : (
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 600, color: DIM }}>Board đang cập nhật, quay lại sau ít phút nhé.</div>
        )}
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 20, color: DIM }}>{`Nguồn: ${def.source}`}</span>
          <span style={{ fontSize: 20, color: DIM }}>{`Cập nhật ${vnTime(at)} (giờ VN) · mỗi giờ một lần`}</span>
        </div>
        <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>surgeindex.lol</span>
      </div>
    </div>
  );
}
