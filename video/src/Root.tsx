import { Composition } from "remotion";
import { ContactSheet } from "./ContactSheet";
import { FramePeek } from "./FramePeek";
import { Demo, totalFrames } from "./Demo";
import { theme } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="RekberDemo" component={Demo} durationInFrames={totalFrames(theme.fps)} fps={theme.fps} width={1920} height={1080} />
    {/* Alat bantu edit, bukan bagian video */}
    <Composition id="Sheet" component={ContactSheet} durationInFrames={1} fps={30} width={2400} height={1600} defaultProps={{ src: "footage/seller-210225.mov", times: [0, 5, 10, 15, 20], cols: 4 }} />
    <Composition id="Peek" component={FramePeek} durationInFrames={1} fps={30} width={1470} height={956} defaultProps={{ src: "footage/seller-204740.mov", t: 45 }} />
  </>
);
