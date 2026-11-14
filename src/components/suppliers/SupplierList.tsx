"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Store } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { Help } from "@/components/ui/Help";
import { SupplierFormModal } from "./ManageForms";

type Row = { id: number; name: string; note: string | null; products: number; invoices: number; lastInvoice: string | null };

/** Liste de tous les fournisseurs, avec « Nouveau fournisseur ». */
export function SupplierList({ suppliers }: { suppliers: Row[] }) {
  const can = useCan();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const s = (n: number) => (n > 1 ? "s" : "");
  return (
    <>
      <div className="page-head">
        <h1>Mes fournisseurs</h1>
        {can("costs.edit") && (
          <button type="button" className="fl-btn fl-btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> Nouveau fournisseur
          </button>
        )}
        <p className="sub">
          {suppliers.length} fournisseur{s(suppliers.length)}. Touche un fournisseur pour le modifier, le supprimer, ou gérer ses
          produits et leurs prix.
          <Help
            title="Gérer les fournisseurs à la main"
            example="Nouveau fournisseur « Moulin Dupont », puis « Ajouter un produit » : Farine T45, au kg, sac de 25, 0,92 €."
          >
            Les fournisseurs arrivent tout seuls quand tu envoies une facture à Claude. Ici, tu peux aussi tout faire toi-même : créer un
            fournisseur, le renommer, le supprimer, lui ajouter des produits et leurs prix, corriger ou supprimer un prix.
          </Help>
        </p>
      </div>
      <div className="fl-list">
        {suppliers.length === 0 && (
          <div className="fl-row" style={{ color: "var(--muted)" }}>
            Aucun fournisseur pour l&apos;instant.
          </div>
        )}
        {suppliers.map((r) => (
          <Link key={r.id} href={`/fournisseurs/${r.id}`} className="fl-row">
            <span className="ic">
              <Store size={16} />
            </span>
            <span className="set-tx">
              <b>
                <span>{r.name}</span>
              </b>
              <small>
                {[
                  `${r.products} produit${s(r.products)}`,
                  `${r.invoices} facture${s(r.invoices)}`,
                  r.lastInvoice ? `dernière le ${new Date(r.lastInvoice).toLocaleDateString("fr-FR")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <ChevronRight size={16} className="set-chev" />
          </Link>
        ))}
      </div>
      {creating && <SupplierFormModal onClose={() => setCreating(false)} onSaved={(id) => router.push(`/fournisseurs/${id}`)} />}
    </>
  );
}
