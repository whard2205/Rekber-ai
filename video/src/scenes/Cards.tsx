import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { Entrance, ExitWrap, WordReveal } from "../components/Motion";

const kicker: React.CSSProperties = { fontFamily: theme.fonts.body, fontSize: 26, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: theme.colors.textDim };
const display = (size: number): React.CSSProperties => ({ fontFamily: theme.fonts.display, fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.01em", color: theme.colors.text });
const body: React.CSSProperties = { fontFamily: theme.fonts.body, fontSize: 34, lineHeight: 1.45, color: theme.colors.textDim };

const Logo: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.bouncy });
  const r = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <Img
      src={staticFile("logo.svg")}
      style={{
        width: size,
        height: size,
        opacity: p,
        transform: `scale(${interpolate(p, [0, 1], [0.6, 1])}) rotate(${interpolate(r, [0, 1], [-14, 0])}deg) translateY(${Math.sin(frame / 30) * 3}px)`,
        filter: `drop-shadow(0 0 ${size * 0.18}px ${theme.colors.glow})`,
      }}
    />
  );
};

export const TitleCard: React.FC = () => (
  <ExitWrap>
    <AbsoluteFill style={{ padding: 160, flexDirection: "row", alignItems: "center", gap: 90 }}>
      <Logo size={300} />
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <Entrance delay={6}><div style={kicker}>Indonesia Web3 Hackathon 2026</div></Entrance>
        <Entrance delay={10}><div style={display(150)}>Rekber AI</div></Entrance>
        <WordReveal text="Rekber yang tidak bisa kabur membawa uangmu." delay={22} style={{ ...body, fontSize: 44, color: theme.colors.text, maxWidth: 1000 }} />
      </div>
    </AbsoluteFill>
  </ExitWrap>
);

export const HookCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = interpolate(spring({ frame: frame - 8, fps, config: { damping: 30, stiffness: 55 } }), [0, 1], [0, 53928]);
  return (
    <ExitWrap>
      <AbsoluteFill style={{ padding: 160, justifyContent: "center", gap: 28 }}>
        <Entrance><div style={kicker}>Modus penipuan nomor 1 di Indonesia</div></Entrance>
        <div style={{ ...display(220), color: theme.colors.primary, fontVariantNumeric: "tabular-nums", textShadow: `0 0 60px ${theme.colors.glow}` }}>
          {Math.round(count).toLocaleString("id-ID")}
        </div>
        <WordReveal text="laporan penipuan belanja online ke Indonesia Anti Scam Centre, Nov 2024 sampai Okt 2025." delay={18} per={2} style={{ ...body, maxWidth: 1250 }} />
        <Entrance delay={276}>
          <div style={{ ...display(64), fontStyle: "italic", fontWeight: 400, marginTop: 30 }}>"Pesan HP, yang datang batu."</div>
        </Entrance>
        <Entrance delay={296}><div style={{ ...body, fontSize: 22 }}>Sumber: data IASC via Databoks Katadata, Okt 2025. Liputan6, Okt 2021.</div></Entrance>
      </AbsoluteFill>
    </ExitWrap>
  );
};

export const IdeaCard: React.FC = () => (
  <ExitWrap>
    <AbsoluteFill style={{ padding: 160, justifyContent: "center", gap: 26 }}>
      <WordReveal text="Uang dikunci di smart contract." style={display(84)} />
      <WordReveal text="Sengketa diputus AI agent." delay={20} style={display(84)} />
      <WordReveal text="Tidak ada admin yang bisa kabur membawa uangmu." delay={48} highlight={[5]} style={{ ...body, fontSize: 40, marginTop: 24 }} />
    </AbsoluteFill>
  </ExitWrap>
);

export const ChapterCard: React.FC<{ kicker: string; title: string }> = ({ kicker: k, title }) => (
  <ExitWrap>
    <AbsoluteFill style={{ padding: 160, justifyContent: "center", gap: 24 }}>
      <Entrance><div style={{ ...kicker, color: theme.colors.primary }}>{k}</div></Entrance>
      <WordReveal text={title} delay={6} style={display(130)} />
    </AbsoluteFill>
  </ExitWrap>
);

export const DiagramCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.07], { easing: theme.ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pan = interpolate(frame, [0, durationInFrames], [0, -18], { easing: theme.ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <ExitWrap>
      <AbsoluteFill style={{ padding: "110px 120px", flexDirection: "row", alignItems: "center", gap: 70 }}>
        <Entrance style={{ flex: "0 0 auto" }}>
          <div style={{ width: 1000, height: 800, borderRadius: 28, overflow: "hidden", boxShadow: "0 50px 90px -30px rgba(0,0,0,0.75)" }}>
            <Img src={staticFile("diagram-ai.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale}) translateY(${pan}px)` }} />
          </div>
        </Entrance>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <Entrance delay={10}><div style={kicker}>Kenapa ini agent</div></Entrance>
          <WordReveal text="AI menilai bukti. Aturan yang memutus." delay={16} highlight={[3, 4, 5]} style={display(58)} />
          <Entrance delay={60}><div style={body}>Cek foto daur ulang sebelum AI dipanggil.</div></Entrance>
          <Entrance delay={72}><div style={body}>Yakin minimal 0,85 atau diserahkan ke manusia.</div></Entrance>
          <Entrance delay={84}><div style={body}>Menyelesaikan transaksi dengan wallet sendiri.</div></Entrance>
        </div>
      </AbsoluteFill>
    </ExitWrap>
  );
};

const Stat: React.FC<{ value: string; label: string; delay: number }> = ({ value, label, delay }) => (
  <Entrance delay={delay} style={{ flex: 1 }}>
    <div style={{ borderTop: `3px solid ${theme.colors.accent}`, paddingTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={display(80)}>{value}</div>
      <div style={{ ...body, fontSize: 30 }}>{label}</div>
    </div>
  </Entrance>
);

export const StatsCard: React.FC = () => (
  <ExitWrap>
    <AbsoluteFill style={{ padding: 160, justifyContent: "center", gap: 70 }}>
      <WordReveal text="Diuji dengan foto asli" highlight={[3]} style={display(80)} />
      <div style={{ display: "flex", gap: 70 }}>
        <Stat value="9 dari 9" label="putusan benar di tiga ronde kalibrasi" delay={18} />
        <Stat value="4 sampai 6 detik" label="untuk setiap putusan AI" delay={24} />
        <Stat value="61" label="tes otomatis smart contract" delay={30} />
      </div>
    </AbsoluteFill>
  </ExitWrap>
);

export const CloseCard: React.FC = () => (
  <AbsoluteFill style={{ padding: 160, flexDirection: "row", alignItems: "center", gap: 90 }}>
    <Logo size={240} />
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <WordReveal text="Kami tidak bisa kabur membawa uangmu, bahkan kalau kami mau." style={{ ...display(62), fontStyle: "italic", fontWeight: 400, maxWidth: 1150 }} />
      <Entrance delay={40}><div style={{ fontFamily: theme.fonts.mono, fontSize: 46, color: theme.colors.primary }}>rekber-ai.vercel.app</div></Entrance>
      <Entrance delay={50}><div style={body}>Kontrak terverifikasi di BscScan, BNB Smart Chain Testnet</div></Entrance>
      <Entrance delay={60}><div style={{ ...body, fontSize: 28 }}>Tim Gedung Hijau. Kode: github.com/whard2205/Rekber-ai</div></Entrance>
    </div>
  </AbsoluteFill>
);
