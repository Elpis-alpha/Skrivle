import type { Metadata } from "next";
import { SignInPageContent } from "@/components/auth/SignInPageContent";
import { PageShell } from "@/components/site/PageShell";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Skrivle with an emailed code, GitHub, or Google to keep your boards.",
};

// STYLE_GUIDE.md §10.14 — email first, then GitHub / Google. No passwords.
// The heading/form-vs-"already signed in" branch lives in SignInPageContent —
// see it for why the Suspense boundary sits where it does.
export default function SignInPage() {
  return (
    <PageShell>
      <SignInPageContent />
    </PageShell>
  );
}
