import { HeartIcon } from "./icons";

export function LivesIndicator({ lives, maxLives = 3 }: { lives: number; maxLives?: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${lives} of ${maxLives} lives remaining`}>
      {Array.from({ length: maxLives }, (_, i) => (
        <HeartIcon
          key={i}
          filled={i < lives}
          className={`w-4 h-4 ${i < lives ? "text-danger" : "text-white/15"}`}
        />
      ))}
    </div>
  );
}
