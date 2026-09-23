import { ADSENSE_CLIENT } from "./ads";

/**
 * Body for /ads.txt (the website, AdSense) and /app-ads.txt (the Android
 * app, AdMob — Google Play looks for it on the developer website listed in
 * the store). Both authorise the same Google publisher account. Served as a
 * 404 until NEXT_PUBLIC_ADSENSE_CLIENT is set, since a wrong ads.txt is
 * worse than none.
 */
export function adsTxtResponse(): Response {
  const publisherId = ADSENSE_CLIENT.replace(/^ca-/, "");
  if (!publisherId) return new Response("Not found", { status: 404 });
  return new Response(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
