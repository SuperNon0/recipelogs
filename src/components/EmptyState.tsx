import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Message sobre affiché quand une liste est vide, avec une action facultative. */
export function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
  icon: Icon,
}: {
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="fl-card empty-state">
      {Icon && (
        <span className="empty-state-ic">
          <Icon size={22} />
        </span>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="fl-btn fl-btn-primary" style={{ marginTop: 10 }}>
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
