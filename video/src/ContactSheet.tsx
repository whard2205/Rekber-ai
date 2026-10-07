import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

/** Alat bantu edit (bukan bagian video): grid cuplikan satu klip di beberapa detik,
 * untuk memilih potongan. Render: npx remotion still src/index.ts Sheet out.png --props='{...}' */
export const ContactSheet: React.FC<{ src: string; times: number[]; cols: number }> = ({ src, times, cols }) => (
  <AbsoluteFill style={{ background: "#fff", display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, padding: 6 }}>
    {times.map((t) => (
      <div key={t} style={{ position: "relative", overflow: "hidden", background: "#000" }}>
        <OffthreadVideo src={staticFile(src)} startFrom={Math.round(t * 30)} muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <div style={{ position: "absolute", left: 6, top: 6, background: "#ffd400", color: "#000", font: "bold 22px sans-serif", padding: "2px 6px" }}>{t}s</div>
      </div>
    ))}
  </AbsoluteFill>
);
