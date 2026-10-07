import { interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import type { Crop } from "../edl";

/** Satu potongan rekaman, di-crop dari koordinat piksel sumber ke kotak tampilan.
 * Rekaman laptop 2940×1912 dipotong ke kolom halaman web (tab browser pribadi tidak ikut). */
const CroppedVideo: React.FC<{ src: string; fromSec: number; toSec: number; speed: number; crop: Crop; source: { w: number; h: number }; boxW: number; boxH: number }> = ({
  src,
  fromSec,
  toSec,
  speed,
  crop,
  source,
  boxW,
  boxH,
}) => {
  const { fps } = useVideoConfig();
  const scale = Math.max(boxW / crop.w, boxH / crop.h);
  return (
    <div style={{ position: "relative", width: boxW, height: boxH, overflow: "hidden", background: theme.colors.bg }}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={Math.round(fromSec * fps)}
        trimAfter={Math.round(toSec * fps)}
        playbackRate={speed}
        muted
        style={{ position: "absolute", width: source.w * scale, height: source.h * scale, left: -crop.x * scale, top: -crop.y * scale, maxWidth: "none" }}
      />
    </div>
  );
};

/** Bingkai perangkat dengan label peran di atasnya, masuk dengan spring + napas pelan. */
export const Device: React.FC<{
  kind: "laptop" | "phone" | "wide";
  src: string;
  fromSec: number;
  toSec: number;
  speed: number;
  crop: Crop;
  source: { w: number; h: number };
  label: string;
}> = ({ kind, src, fromSec, toSec, speed, crop, source, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: theme.spring.smooth });
  const breathe = 1 + Math.sin(frame / 40) * 0.004;
  const box = kind === "wide" ? { w: 1300, h: 650 } : kind === "laptop" ? { w: 610, h: 960 } : { w: 444, h: 960 };
  const radius = kind === "phone" ? 44 : 18;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "center",
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [60, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1]) * breathe})`,
      }}
    >
      <div style={{ fontFamily: theme.fonts.body, fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: theme.colors.textDim }}>{label}</div>
      <div
        style={{
          borderRadius: radius,
          overflow: "hidden",
          border: kind === "phone" ? "10px solid #05090D" : "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 50px 90px -30px rgba(0,0,0,0.75)",
        }}
      >
        <CroppedVideo src={src} fromSec={fromSec} toSec={toSec} speed={speed} crop={crop} source={source} boxW={box.w} boxH={box.h} />
      </div>
    </div>
  );
};
