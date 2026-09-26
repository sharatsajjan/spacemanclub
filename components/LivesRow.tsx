import { WaterDropIcon } from "./icons";

export function LivesRow({ lives, maxLives = 3 }: { lives: number; maxLives?: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${lives} of ${maxLives} lives remaining`}>
      {Array.from({ length: maxLives }, (_, i) => (
        <WaterDropIcon
          key={i}
          className="w-5 h-5"
          style={{ color: i < lives ? "var(--accent)" : "var(--chip)" }}
        />
      ))}
    </div>
  );
}
