import Link from "next/link";
import { BellRing, Check, ShoppingCart } from "lucide-react";
import { Help } from "@/components/ui/Help";
import { JOURS } from "@/lib/orderDays";
import type { RappelCommande } from "@/lib/orderDays";

/**
 * « À commander aujourd'hui » : les fournisseurs dont c'est le jour de commande
 * (réglé sur leur fiche), avec un bouton pour passer la commande. Rien n'est
 * affiché si aucun fournisseur n'attend de commande aujourd'hui.
 */
export function OrderReminder({ jour, rappels, peutCommander }: { jour: number; rappels: RappelCommande[]; peutCommander: boolean }) {
  if (!rappels.length) return null;
  const reste = rappels.filter((r) => !r.commandee).length;
  return (
    <section className="order-reminder" data-module="commandes">
      <div className="sect-title" style={{ marginTop: 6 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BellRing size={17} /> À commander aujourd&apos;hui ({JOURS[jour - 1].nom})
          {reste === 0 && <small style={{ color: "var(--muted)", fontWeight: 400 }}> · tout est commandé</small>}
          <Help title="À commander aujourd'hui" example="France Frais : commande le lundi, mercredi et vendredi, livre le mardi, jeudi et samedi.">
            Les fournisseurs dont c&apos;est le jour de commande. Règle ces jours sur la fiche du fournisseur (« Modifier »,
            puis « Jours de commande » et « Jours de livraison »). Une fois la commande passée dans RecipeLog le jour même, le
            fournisseur est coché « Commandé ». Le rappel revient tout seul au prochain jour de commande.
          </Help>
        </h2>
      </div>
      <div className="fl-list">
        {rappels.map((r) => (
          <div key={r.id} className="fl-row">
            <span className="ic" style={r.commandee ? { color: "var(--ok, #2e7d32)" } : undefined}>
              {r.commandee ? <Check size={16} /> : <ShoppingCart size={16} />}
            </span>
            <span className="set-tx">
              <b>
                <Link href={`/fournisseurs/${r.id}`}>{r.name}</Link>
              </b>
              <small>
                {[r.commandee ? "Commandé aujourd'hui" : null, r.livraison ? `livré ${r.livraison}` : null].filter(Boolean).join(" · ") ||
                  "À commander"}
              </small>
            </span>
            {peutCommander && !r.commandee && (
              <Link href={`/fournisseurs/${r.id}/commande`} className="fl-btn fl-btn-primary" style={{ marginLeft: "auto" }}>
                Commander
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
