import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

/** Alat bantu edit: satu frame penuh dari klip di detik t, untuk mengukur area crop. */
export const FramePeek: React.FC<{ src: string; t: number }> = ({ src, t }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(t * 30)} muted style={{ width: "100%", height: "100%" }} />
    {Array.from({ length: 15 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: `${(i * 100) / 14.7}%`, top: 0, bottom: 0, borderLeft: "1px solid #ff0", color: "#ff0", font: "12px sans-serif" }}>{Math.round(i * 200)}</div>
    ))}
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", top: `${(i * 100) / 9.56}%`, left: 0, right: 0, borderTop: "1px solid #0ff", color: "#0ff", font: "12px sans-serif" }}>{Math.round(i * 200)}</div>
    ))}
  </AbsoluteFill>
);
