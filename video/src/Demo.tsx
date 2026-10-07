import { Sequence, Audio, staticFile } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { theme } from "./theme";
import { NARRATION, SCENES, sceneFrames, type Scene } from "./edl";
import { Stage } from "./components/Layers";
import { ClipScene } from "./scenes/ClipScene";
import { ChapterCard, CloseCard, DiagramCard, HookCard, IdeaCard, StatsCard, TitleCard } from "./scenes/Cards";

const render = (s: Scene) => {
  switch (s.type) {
    case "clip": return <ClipScene s={s} />;
    case "title": return <TitleCard />;
    case "hook": return <HookCard />;
    case "idea": return <IdeaCard />;
    case "chapter": return <ChapterCard kicker={s.kicker} title={s.title} />;
    case "diagram": return <DiagramCard />;
    case "stats": return <StatsCard />;
    case "close": return <CloseCard />;
  }
};

const timing = springTiming({ config: { damping: 200 }, durationInFrames: theme.transitionFrames });

// Setiap Sequence diperpanjang selebar transisinya, supaya awal adegan ke-n jatuh tepat di
// jumlah durasi adegan sebelumnya = saat paragraf ke-n narasi mulai diucapkan.
const seqFrames = (i: number, fps: number): number =>
  sceneFrames(SCENES[i], fps) + (i < SCENES.length - 1 ? theme.transitionFrames : 0);

/** Awal tiap adegan di timeline akhir. */
export const sceneStarts = (fps: number): number[] => {
  let t = 0;
  return SCENES.map((s) => {
    const start = t;
    t += sceneFrames(s, fps);
    return start;
  });
};

export const totalFrames = (fps: number): number => SCENES.reduce((sum, s) => sum + sceneFrames(s, fps), 0);

export const Demo: React.FC = () => {
  const starts = sceneStarts(theme.fps);
  return (
    <>
      <Stage>
        <TransitionSeries>
          {SCENES.flatMap((s, i) => {
            const seq = (
              <TransitionSeries.Sequence key={`s${i}`} durationInFrames={seqFrames(i, theme.fps)}>
                {render(s)}
              </TransitionSeries.Sequence>
            );
            if (i === SCENES.length - 1) return [seq];
            const presentation = s.type === "chapter" || SCENES[i + 1].type === "chapter" ? fade() : slide({ direction: "from-right" });
            return [seq, <TransitionSeries.Transition key={`t${i}`} presentation={presentation} timing={timing} />];
          })}
        </TransitionSeries>
      </Stage>
      <Audio src={staticFile(NARRATION.src)} trimBefore={Math.round(NARRATION.trimStart * theme.fps)} volume={NARRATION.volume} />
      {/* Musik diredam di bawah suara. */}
      <Audio src={staticFile("sfx/pad.wav")} volume={0.07} loop />
      {starts.slice(1).map((f, i) => (
        <Sequence key={i} from={Math.max(0, f - 3)} durationInFrames={20}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.18} />
        </Sequence>
      ))}
    </>
  );
};
