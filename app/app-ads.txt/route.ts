import { adsTxtResponse } from "@/lib/adsTxt";

export const dynamic = "force-static";

export function GET() {
  return adsTxtResponse();
}
