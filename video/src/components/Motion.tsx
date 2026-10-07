import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

/** Masuk: opacity + naik + skala, pakai spring. */
export const Entrance: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div style={{ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px) scale(${interpolate(p, [0, 1], [0.95, 1])})`, ...style }}>
      {children}
    </div>
  );
};

/** Kata demi kata. `highlight` = indeks kata yang diberi warna hero. */
export const WordReveal: React.FC<{ text: string; delay?: number; per?: number; highlight?: number[]; style?: React.CSSProperties }> = ({
  text,
  delay = 0,
  per = 3,
  highlight = [],
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Jarak antar kata ikut ukuran huruf (16px di huruf 130px = kata menempel).
  const fontSize = typeof style?.fontSize === "number" ? style.fontSize : 40;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: Math.round(fontSize * 0.27), ...style }}>
      {text.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${interpolate(p, [0, 1], [28, 0])}px)`,
              color: highlight.includes(i) ? theme.colors.primary : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Keluar lebih cepat dari masuk: 10 frame terakhir adegan. */
export const ExitWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [durationInFrames - 12, durationInFrames - 2], [0, 1], {
    easing: theme.ease.in,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ position: "absolute", inset: 0, opacity: 1 - t, transform: `translateY(${-30 * t}px)` }}>{children}</div>;
};
