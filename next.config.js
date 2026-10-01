/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export so the Android app (Capacitor) can bundle the game as plain
  // files and run fully offline. trailingSlash gives every route its own
  // folder/index.html, which is what Capacitor's local file server resolves.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
