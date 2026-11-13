import type { ReactNode } from "react";
import { Link } from "react-router";

export function SectionHeader({
  title,
  count,
  to,
  seeAllLabel = "See all",
  action,
}: {
  title: string;
  count?: number;
  to?: string;
  seeAllLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-1">
      <h2 className="text-xs font-semibold text-soft">
        {title}
        {count != null && <span className="num ml-1.5">{count}</span>}
      </h2>
      {action ??
        (to && (
          <Link
            to={to}
            className="inline-flex h-8 items-center rounded-sm bg-secondary px-2.5 text-2xs font-semibold text-on-secondary transition-colors duration-150 hover:bg-hover"
          >
            {seeAllLabel}
          </Link>
        ))}
    </div>
  );
}
