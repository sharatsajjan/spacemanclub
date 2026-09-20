import { StarIcon } from "./icons";

export function StarRow({ stars, size = "md" }: { stars: number; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((n) => (
        <StarIcon
          key={n}
          filled={n <= stars}
          className={`${dim} ${n <= stars ? "text-warn" : "text-white/15"}`}
        />
      ))}
    </div>
  );
}
