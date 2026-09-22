import { Picture, PICTURE_HEIGHT, PICTURE_WIDTH } from "@/lib/pictures";

/**
 * Renders a picture as its own little grid of pixels. Used both for the
 * reward on the completion screen and for the gallery, at whatever size the
 * caller gives it.
 */
export function PictureTile({
  picture,
  size,
  locked = false,
}: {
  picture: Picture;
  size: number;
  locked?: boolean;
}) {
  return (
    <div
      className="grid"
      role="img"
      aria-label={locked ? "Not yet found" : picture.name}
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(${PICTURE_WIDTH}, 1fr)`,
        gridTemplateRows: `repeat(${PICTURE_HEIGHT}, 1fr)`,
      }}
    >
      {picture.rows.flatMap((row, r) =>
        [...row].map((key, c) => {
          const color = key === "." ? null : picture.palette[key];
          return (
            <div
              key={`${r}-${c}`}
              style={{
                backgroundColor: color ? (locked ? "var(--chip)" : color) : "transparent",
              }}
            />
          );
        })
      )}
    </div>
  );
}
