import Link from "next/link";
import { Check, ChevronLeft, CircleAlert, Clapperboard, FolderOpen, MessageSquareText, Plug } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getMcpToken } from "@/lib/mcp/token";
import { PLATFORM_FOLDER, toolVersion } from "@/lib/videoImport";
import { IMPORT_TAG } from "@/lib/mcp/tools/video";
import { SHORTCUT_PROMPT } from "@/lib/shortcutPrompt";
import { CopyPromptButton } from "@/components/settings/ShortcutGuide";
import { Help } from "@/components/ui/Help";

export const dynamic = "force-dynamic";

export default async function ImportVideoSettingsPage() {
  const folderNames = Object.values(PLATFORM_FOLDER);
  const [ytDlp, ffmpeg, token, folders] = await Promise.all([
    toolVersion("yt-dlp"),
    toolVersion("ffmpeg"),
    getMcpToken(),
    prisma.folder.findMany({ where: { name: { in: folderNames, mode: "insensitive" } }, select: { name: true } }),
  ]);
  const existing = new Set(folders.map((f) => f.name.toLowerCase()));

  const status = (ok: boolean, title: string, sub: string, Icon = ok ? Check : CircleAlert) => (
    <div className="fl-row">
      <span className="ic" style={{ color: ok ? "var(--accent)" : "var(--danger)" }}>
        <Icon size={17} />
      </span>
      <span className="set-tx">
        <b>
          <span>{title}</span>
        </b>
        <small>{sub}</small>
      </span>
    </div>
  );

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Recettes depuis TikTok</h1>
        <p className="sub">
          Partage une vidéo TikTok, Instagram, YouTube ou un lien de recette à Claude : il lit la vidéo et
          ajoute la recette dans RecipeLog.
        </p>
      </div>

      <div className="sect-title" style={{ marginTop: 0 }}>
        <h2>État</h2>
      </div>
      <div className="fl-list">
        {status(
          !!token,
          "Accès MCP",
          token ? "Activé : Claude peut utiliser l'outil « Lire une vidéo »" : "Coupé : active-le dans Réglages → Accès MCP",
          Plug,
        )}
        {status(
          !!ytDlp,
          "Lecteur de vidéos (yt-dlp)",
          ytDlp ? `Installé, version ${ytDlp}` : "Pas encore installé : lance « Mettre à jour le site », il s'installe tout seul",
        )}
        {status(
          !!ffmpeg,
          "Extraction d'images (ffmpeg)",
          ffmpeg ? `Installé, version ${ffmpeg}` : "Pas encore installé : lance « Mettre à jour le site », il s'installe tout seul",
        )}
        <div className="fl-row">
          <span className="ic">
            <FolderOpen size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Dossiers de rangement</span>
              <Help title="Dossiers de rangement">
                Chaque recette va dans le dossier de sa provenance : {folderNames.join(", ")} (pour les autres
                sites). Un dossier qui manque est créé par Claude la première fois. Les recettes reçoivent
                l&apos;étiquette « {IMPORT_TAG} » : retire-la une fois la recette relue.
              </Help>
            </b>
            <small>
              {folderNames.map((n) => `${n}${existing.has(n.toLowerCase()) ? "" : " (sera créé)"}`).join(" · ")}
            </small>
          </span>
        </div>
      </div>

      <div className="sect-title">
        <h2>Le plus simple : partager à Claude</h2>
      </div>
      <ol className="set-note" style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <li>
          Dans TikTok (ou Instagram, Safari…) : <b>Partager</b> → <b>Claude</b> (dans la rangée
          d&apos;apps, ou sous <b>Plus</b>). Sinon : <b>Copier le lien</b> et colle-le dans l&apos;app Claude.
        </li>
        <li>
          Écris « ajoute cette recette dans RecipeLog » et envoie. RecipeLog doit être activé dans le menu
          des outils de Claude.
        </li>
        <li>
          Claude lit la vidéo (description, ce qui est dit, texte à l&apos;écran), te demande l&apos;accord pour
          utiliser les outils, puis crée la recette. Compte jusqu&apos;à une minute.
        </li>
      </ol>
      <p className="set-note" style={{ marginTop: 10 }}>
        Une capture d&apos;écran marche aussi : envoie-la à Claude avec « ajoute cette recette dans RecipeLog,
        dossier TikTok ».
      </p>

      <div className="sect-title">
        <h2>En un geste : le Raccourci iPhone</h2>
      </div>
      <p className="set-note">
        Pour ne rien taper : un raccourci « Ajouter à RecipeLog » dans le menu Partager envoie le lien à
        Claude avec la bonne consigne. Il faut iOS 18 et l&apos;app Claude. À créer une seule fois, en 2 minutes :
      </p>
      <ol className="set-note" style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        <li>
          Ouvre l&apos;app <b>Raccourcis</b> → <b>+</b> en haut à droite. Nomme-le « Ajouter à RecipeLog ».
        </li>
        <li>
          Touche le <b>i</b> (Détails) → active <b>Afficher dans la feuille de partage</b>. En haut du raccourci,
          dans « Recevoir … de Feuille de partage », ne garde que <b>URL</b> et <b>Texte</b>.
        </li>
        <li>
          Ajoute l&apos;action <b>Demander à Claude</b> (Ask Claude). Dans son texte, colle la consigne
          ci-dessous, puis à la fin insère la variable <b>Entrée du raccourci</b>.
        </li>
        <li>
          C&apos;est prêt : dans TikTok, <b>Partager</b> → fais défiler les icônes → <b>Plus</b> →{" "}
          <b>Ajouter à RecipeLog</b>. Tu peux le mettre en favori pour qu&apos;il soit en premier.
        </li>
      </ol>
      <div className="fl-list" style={{ marginTop: 10 }}>
        <div className="fl-row">
          <span className="ic">
            <MessageSquareText size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Consigne à coller</span>
            </b>
            <small style={{ userSelect: "all" }}>{SHORTCUT_PROMPT}</small>
          </span>
          <CopyPromptButton />
        </div>
      </div>
      <p className="set-note" style={{ marginTop: 10 }}>
        Si « Demander à Claude » répond sans pouvoir utiliser RecipeLog (les connecteurs n&apos;y sont pas
        toujours disponibles), remplace-la par trois actions : <b>Texte</b> (la même consigne suivie de{" "}
        <b>Entrée du raccourci</b>), <b>Copier dans le presse-papiers</b>, puis <b>Ouvrir l&apos;app</b> → Claude.
        Il ne reste qu&apos;à coller et envoyer.
      </p>

      <div className="sect-title">
        <h2>Bon à savoir</h2>
      </div>
      <div className="fl-list">
        {status(
          true,
          "TikTok et YouTube",
          "Marchent en général bien. Les sous-titres ne sont pas toujours présents : Claude s'appuie alors sur la description et les images.",
          Clapperboard,
        )}
        {status(
          true,
          "Instagram",
          "Moins fiable : Instagram demande souvent d'être connecté. Si ça échoue, envoie plutôt une capture d'écran.",
          Clapperboard,
        )}
        {status(
          true,
          "Rien n'est inventé",
          "Une quantité absente de la vidéo n'est pas devinée : elle est signalée dans les notes de la recette.",
          Check,
        )}
      </div>
    </div>
  );
}
