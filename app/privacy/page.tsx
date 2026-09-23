import type { Metadata } from "next";
import Link from "next/link";
import { ThemeStyle } from "@/components/ThemeStyle";
import { DEFAULT_THEME } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Privacy Policy · ArrowFlow",
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
const LAST_UPDATED = "September 23, 2026";

/**
 * Required by AdSense, AdMob and the Google Play listing. Keep it in step
 * with what the game actually does: if a new SDK or data use is added,
 * update this page and the Play Console data safety form together.
 */
export default function PrivacyPage() {
  return (
    <>
      <ThemeStyle themeId={DEFAULT_THEME} />
      <main className="min-h-screen bg-outer px-4 py-8">
        <article className="w-full max-w-xl mx-auto text-sm text-text leading-relaxed flex flex-col gap-4">
          <Link href="/" className="text-sub text-xs font-semibold">
            &larr; Back to ArrowFlow
          </Link>
          <h1 className="font-extrabold text-xl text-accent">Privacy Policy</h1>
          <p className="text-sub text-xs">Last updated: {LAST_UPDATED}</p>

          <Section title="What the game stores">
            ArrowFlow has no accounts and no sign-in. Your progress (level, coins, stars, lives and chosen theme) is
            saved only on your device, in your browser&rsquo;s local storage or the app&rsquo;s storage. We do not
            send it to our own servers. Clearing site data or uninstalling the app deletes it.
          </Section>

          <Section title="Advertising">
            ArrowFlow is free and shows ads between levels, plus optional ads you can choose to watch for a reward
            (an extra life or bonus coins). On the website, ads are served by Google AdSense. In the Android app, ads
            are served by Google AdMob, which may also show ads from partner networks such as Meta Audience Network.
            <br />
            <br />
            These providers may use cookies, your device&rsquo;s advertising ID, IP address and similar information to
            show ads, limit how often you see them, measure their performance and prevent fraud. Where required (for
            example in the EEA, the UK and Switzerland), you will be asked for consent before personalised ads are
            shown, and you can change that choice at any time. You can also reset or opt out of your advertising ID in
            your device settings.
            <br />
            <br />
            Learn more:{" "}
            <ExternalLink href="https://policies.google.com/technologies/partner-sites">
              How Google uses information from sites or apps that use its services
            </ExternalLink>
            {" · "}
            <ExternalLink href="https://www.facebook.com/privacy/policy/">Meta Privacy Policy</ExternalLink>
          </Section>

          <Section title="Children">
            ArrowFlow is not directed at children under 13, and we do not knowingly collect personal information from
            them.
          </Section>

          <Section title="Changes">
            If this policy changes, the updated version will be posted on this page with a new date.
          </Section>

          {CONTACT_EMAIL && (
            <Section title="Contact">
              Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline">{CONTACT_EMAIL}</a>
            </Section>
          )}
        </article>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="font-bold text-base text-text">{title}</h2>
      <p className="text-sub">{children}</p>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {children}
    </a>
  );
}
