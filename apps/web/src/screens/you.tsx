import { Suspense } from "react";
import { Link } from "react-router";
import { SegmentBar, useSegment } from "@/components/segments";
import { lazyRoute } from "@/lib/lazy-route";

// You tab (redesign §7/§8.10): profile and settings as segments, plus links to
// the rule library and changelog. Embeds the existing screens as-is; J10 owns
// profile/settings and restyles them.
const ProfileScreen = lazyRoute(() => import("@/screens/profile"));
const SettingsScreen = lazyRoute(() => import("@/screens/settings"));

const SEGMENTS = ["profile", "settings"] as const;

export default function YouScreen() {
  const [segment, setSegment] = useSegment(SEGMENTS, "profile");
  return (
    <div className="mx-auto max-w-2xl pb-20 md:pb-6">
      <SegmentBar
        value={segment}
        onChange={(v) => setSegment(v as (typeof SEGMENTS)[number])}
        options={[
          { value: "profile", label: "Profile" },
          { value: "settings", label: "Settings" },
        ]}
      />
      <Suspense fallback={null}>
        {segment === "profile" ? <ProfileScreen /> : <SettingsScreen />}
      </Suspense>
      <div className="flex flex-wrap gap-2 px-4">
        <Link
          to="/you/rules"
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
        >
          How Frog decides
        </Link>
        <Link
          to="/measures"
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
          data-testid="you-body-log"
        >
          Body log
        </Link>
        <Link
          to="/changelog"
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
        >
          Changelog
        </Link>
      </div>
    </div>
  );
}
