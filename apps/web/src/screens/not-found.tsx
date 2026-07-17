import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/lib/voice";

// 404 — pure playground zone (docs/brand/frog-brand-identity.html §04): no
// data lives here, so the frog gets the whole page. Copy comes verbatim from
// the brand doc's 404 sample and re-voices with the register setting.
export default function NotFoundScreen() {
  const { t } = useVoice();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 px-4 py-16 pb-20 md:pb-16">
      <p className="num text-2xs tracking-widest text-faint uppercase">
        {t("HTTP 404 · specimens found: 0")}
      </p>
      <h1 className="text-lg font-semibold tracking-tight">
        {t("Page not found.", "This page is not in the literature.")}
      </h1>
      <p className="max-w-prose text-sm text-soft">
        {t(
          "We could not find this page. Check the URL or head back home.",
          "The frog searched every folder and one lily pad. Nothing here. Achievement unlocked: “Control Group” — you visited a page with no data whatsoever.",
        )}
      </p>
      <Button
        variant="primary"
        size="md"
        className="mt-2"
        onClick={() => navigate("/")}
      >
        {t("Back home", "Return to the lab")}
      </Button>
    </div>
  );
}
