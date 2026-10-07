// Satu sumber warna, font, easing, dan spring untuk seluruh video. Palet = brand Rekber AI
// (logo, deck, web): navy, amber, krem. Jangan menulis hex atau easing langsung di komponen.
import { Easing } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/LibreBaskerville";
import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

const serif = loadSerif("normal", { weights: ["400", "700"], subsets: ["latin"] });
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const theme = {
  colors: {
    bg: "#0E1620",
    bgAlt: "#16212E",
    surface: "#1B2838",
    primary: "#E3A33B", // amber: maksimal satu elemen per frame
    accent: "#4F6D8F",
    text: "#F5F1E8",
    textDim: "#9FACBA",
    glow: "rgba(227, 163, 59, 0.35)",
  },
  fonts: {
    display: serif.fontFamily,
    body: sans.fontFamily,
    mono: mono.fontFamily,
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
  },
  fps: 30,
  transitionFrames: 12,
} as const;
