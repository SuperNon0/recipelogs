import Link from "next/link";

export function Fab({
  href,
  label = "Ajouter",
  children = "+",
}: {
  href: string;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed z-50 flex items-center justify-center"
      style={{
        bottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        right: "1.2rem",
        width: 64,
        height: 64,
        background: "var(--pending)",
        color: "var(--accent-ink)",
        borderRadius: 20,
        fontSize: "2rem",
        fontWeight: 700,
        boxShadow: "0 4px 16px rgba(143, 156, 240, 0.35)",
      }}
    >
      {children}
    </Link>
  );
}
