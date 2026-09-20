import { ThemeId } from "./types";

export interface Theme {
  id: ThemeId;
  name: string;
  outer: string;
  panel: string;
  maze: string;
  text: string;
  sub: string;
  sub2: string;
  accent: string;
  accent2: string;
  accent3: string;
  line: string;
  lineDone: string;
  btnText: string;
  chip: string;
  danger: string;
}

export const THEMES: Theme[] = [
  {
    id: "linen",
    name: "Linen",
    outer: "#d8cdb8",
    panel: "#f0e9dc",
    maze: "#e8dfcd",
    text: "#5c4a36",
    sub: "#8a7358",
    sub2: "#a3937a",
    accent: "#8a5a2f",
    accent2: "#a35c52",
    accent3: "#c9843b",
    line: "#8a5a2f",
    lineDone: "rgba(138,90,47,0.3)",
    btnText: "#fdf6ea",
    chip: "rgba(90,60,30,0.08)",
    danger: "#c0483f",
  },
  {
    id: "slate",
    name: "Slate Night",
    outer: "#171826",
    panel: "#20223a",
    maze: "#262a46",
    text: "#e9e7f5",
    sub: "#9a95bf",
    sub2: "#726d99",
    accent: "#c9a86a",
    accent2: "#e08c93",
    accent3: "#c9a86a",
    line: "#c9a86a",
    lineDone: "rgba(201,168,106,0.32)",
    btnText: "#1b1a2e",
    chip: "rgba(201,168,106,0.14)",
    danger: "#e08c93",
  },
  {
    id: "sage",
    name: "Sage",
    outer: "#d7dcc9",
    panel: "#eef1e3",
    maze: "#e5e9d6",
    text: "#3f4a34",
    sub: "#748261",
    sub2: "#93a17c",
    accent: "#4f6b3f",
    accent2: "#8a6b3f",
    accent3: "#6b8a4f",
    line: "#4f6b3f",
    lineDone: "rgba(79,107,63,0.3)",
    btnText: "#f4f7ec",
    chip: "rgba(60,90,45,0.1)",
    danger: "#a35c52",
  },
  {
    id: "dusk",
    name: "Dusk",
    outer: "#d9cdd2",
    panel: "#f2e7eb",
    maze: "#ecdee3",
    text: "#4a3640",
    sub: "#8a6d78",
    sub2: "#a68d97",
    accent: "#7a4a5c",
    accent2: "#a35c52",
    accent3: "#8a6b3f",
    line: "#7a4a5c",
    lineDone: "rgba(122,74,92,0.3)",
    btnText: "#fbf1f4",
    chip: "rgba(122,74,92,0.1)",
    danger: "#a35c52",
  },
  {
    id: "ocean",
    name: "Ocean",
    outer: "#cdd6d8",
    panel: "#e6eded",
    maze: "#dbe6e6",
    text: "#2f4a4c",
    sub: "#5f8285",
    sub2: "#7fa0a2",
    accent: "#2f6b6e",
    accent2: "#5c8a52",
    accent3: "#3f8a8f",
    line: "#2f6b6e",
    lineDone: "rgba(47,107,110,0.3)",
    btnText: "#eef7f7",
    chip: "rgba(47,107,110,0.1)",
    danger: "#a35c52",
  },
];

export const DEFAULT_THEME: ThemeId = "ocean";

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}
