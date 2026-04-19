import Link from "next/link";

export function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="fl-card text-center py-14 flex flex-col items-center gap-4">
      <h2 className="fl-title-serif" style={{ fontSize: "1.35rem" }}>
        {title}
      </h2>
      {description && (
        <p className="text-[color:var(--muted)] max-w-md">{description}</p>
      )}
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="fl-btn fl-btn-primary mt-2">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
