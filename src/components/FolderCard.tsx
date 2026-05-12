import Link from "next/link";

/**
 * Carte cliquable représentant un dossier de recettes — affichée dans la vue
 * d'accueil « explorateur » de /recettes.
 */
export function FolderCard({
  id,
  name,
  color,
  count,
}: {
  id: number;
  name: string;
  color: string;
  count: number;
}) {
  return (
    <Link
      href={`/?folder=${id}`}
      className="fl-card flex flex-col items-center justify-center gap-1 text-center hover:border-[color:var(--muted)] transition-colors"
      style={{
        aspectRatio: "4 / 3",
        background: `linear-gradient(135deg, ${color}1a 0%, transparent 70%)`,
        borderColor: `${color}55`,
        padding: "0.6rem 0.5rem",
      }}
    >
      <span style={{ fontSize: "1.6rem", color }}>📁</span>
      <span
        className="fl-title-serif"
        style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.2, wordBreak: "break-word" }}
      >
        {name}
      </span>
      <span className="fl-label" style={{ fontSize: "0.68rem" }}>
        {count} recette{count > 1 ? "s" : ""}
      </span>
    </Link>
  );
}
