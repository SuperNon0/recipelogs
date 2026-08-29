import Link from "next/link";
import { Icon } from "./Icon";

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
      className="fl-card flex flex-col items-center justify-center gap-2 text-center hover:border-[color:var(--muted)] transition-colors"
      style={{
        aspectRatio: "1 / 1",
        background: `linear-gradient(135deg, ${color}1a 0%, transparent 70%)`,
        borderColor: `${color}55`,
      }}
    >
      <Icon name="Folder" size={40} strokeWidth={1.5} style={{ color }} />
      <span
        className="fl-title-serif"
        style={{ fontSize: "1rem", color: "var(--text)", lineHeight: 1.15 }}
      >
        {name}
      </span>
      <span className="fl-label" style={{ fontSize: "0.75rem" }}>
        {count} recette{count > 1 ? "s" : ""}
      </span>
    </Link>
  );
}
