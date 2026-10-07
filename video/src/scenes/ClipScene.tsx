import { AbsoluteFill } from "remotion";
import { theme } from "../theme";
import { Device } from "../components/Devices";
import { Entrance, ExitWrap, WordReveal } from "../components/Motion";
import { clipSpeed, type ClipScene as ClipSceneData } from "../edl";

const Caption: React.FC<{ s: ClipSceneData; width: number }> = ({ s, width }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 24, width }}>
    {s.step && (
      <Entrance delay={8}>
        <div style={{ fontFamily: theme.fonts.body, fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: theme.colors.textDim }}>Langkah {s.step}</div>
      </Entrance>
    )}
    <WordReveal
      text={s.title}
      delay={12}
      highlight={s.highlight}
      style={{ fontFamily: theme.fonts.display, fontSize: 60, fontWeight: 700, lineHeight: 1.12, color: theme.colors.text }}
    />
    <Entrance delay={26}>
      <div style={{ fontFamily: theme.fonts.body, fontSize: 32, lineHeight: 1.45, color: theme.colors.textDim }}>{s.body}</div>
    </Entrance>
  </div>
);

export const ClipScene: React.FC<{ s: ClipSceneData }> = ({ s }) => {
  const device = <Device kind={s.kind} src={s.src} fromSec={s.from} toSec={s.to} speed={clipSpeed(s)} crop={s.crop} source={s.source} label={s.label} />;
  if (s.kind === "wide") {
    return (
      <ExitWrap>
        <AbsoluteFill style={{ padding: "50px 160px", alignItems: "center", justifyContent: "center", gap: 30 }}>
          {device}
          <Caption s={s} width={1240} />
        </AbsoluteFill>
      </ExitWrap>
    );
  }
  return (
    <ExitWrap>
      <AbsoluteFill style={{ padding: "0 140px", flexDirection: "row", alignItems: "center", gap: 100 }}>
        <div style={{ width: 640, display: "flex", justifyContent: "center" }}>{device}</div>
        <Caption s={s} width={900} />
      </AbsoluteFill>
    </ExitWrap>
  );
};
