import { THEMES } from "@/lib/themes";
import { ThemeId } from "@/lib/types";

export function ThemePicker({ current, onSelect }: { current: ThemeId; onSelect: (id: ThemeId) => void }) {
  return (
    <div className="flex justify-center gap-3 flex-wrap">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className="flex flex-col items-center gap-1.5"
          aria-label={`${t.name} theme`}
        >
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: t.panel,
              border: `3px solid ${current === t.id ? t.text : "transparent"}`,
            }}
          >
            <span className="w-3.5 h-3.5 rounded-full" style={{ background: t.line }} />
          </span>
          <span className="text-[10px] font-bold" style={{ color: "var(--sub)" }}>
            {t.name}
          </span>
        </button>
      ))}
    </div>
  );
}
