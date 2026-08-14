import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { IconButton, iconButtonClass } from "@/components/ui/icon-button";

type BackButtonProps = {
  /** Navigate to a fixed route. Omit and pass `onClick` for e.g. history.back(). */
  to?: string;
  onClick?: () => void;
  label: string;
  className?: string;
  "data-testid"?: string;
};

/**
 * The screen-header back arrow: same square icon-button treatment everywhere
 * instead of a bare, backgroundless `<ArrowLeft>`. Renders a `Link` when `to`
 * is given, otherwise a plain button (e.g. `navigate(-1)`).
 */
export function BackButton({
  to,
  onClick,
  label,
  className,
  "data-testid": testId,
}: BackButtonProps) {
  const icon = <ArrowLeft className="size-4" />;
  if (to) {
    return (
      <Link
        to={to}
        aria-label={label}
        className={iconButtonClass({ className })}
        data-testid={testId}
      >
        {icon}
      </Link>
    );
  }
  return (
    <IconButton
      aria-label={label}
      onClick={onClick}
      className={className}
      data-testid={testId}
    >
      {icon}
    </IconButton>
  );
}
