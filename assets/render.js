// Renders the SVG sources in this folder to the PNGs @capacitor/assets reads.
// Run `npm run android:assets` after editing any of them.
const sharp = require("sharp");
const path = require("path");

const pairs = [
  ["icon-foreground.svg", "icon-foreground.png"],
  ["icon-background.svg", "icon-background.png"],
  ["icon-only.svg", "icon-only.png"],
  ["splash.svg", "splash.png"],
  ["splash.svg", "splash-dark.png"],
];

Promise.all(
  pairs.map(([src, out]) => sharp(path.join(__dirname, src)).png().toFile(path.join(__dirname, out)))
).then(() => console.log("Rendered", pairs.length, "images"));
