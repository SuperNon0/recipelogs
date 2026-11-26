"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { PRICE_UNITS, formatEuro, type PriceUnit } from "@/lib/cost";
import { SUPPLIER_FAMILIES } from "@/lib/suppliers";
import { PACK_NAMES, packNameOf } from "@/lib/supplierOrders";
import { JOURS } from "@/lib/orderDays";
import { MAX_CONTACTS, type Contact } from "@/lib/supplierContacts";
import {
  addPrice,
  addProduct,
  addSupplier,
  editInvoice,
  editPrice,
  editProduct,
  editSupplier,
  getSupplierDeletionInfo,
  removePrice,
  removeProduct,
  removeSupplier,
} from "@/app/actions/suppliers";

type Result = { ok: true } | { ok: false; error: string };

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null ; texte → NaN. */
export const parseNumber = (v: string) => (v.trim() === "" ? null : Number(v.trim().replace(/\s/g, "").replace(",", ".")));
const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const today = () => new Date().toISOString().slice(0, 10);

/** Libellé de champ avec son « ? ». */
function Field({ label, help, children }: { label: string; help?: { title: string; text: React.ReactNode; example?: React.ReactNode }; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span className="fl-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {help && (
          <Help title={help.title} example={help.example}>
            {help.text}
          </Help>
        )}
      </span>
      {children}
    </label>
  );
}

const two = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 } as const;

/** Formulaire de fenêtre : bouton Enregistrer, erreur, et bouton Supprimer optionnel en bas. */
function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel = "Enregistrer",
  onDelete,
  deleteLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<Result>;
  submitLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalOverlay onClose={onClose} title={title}>
      <form
        style={{ display: "grid", gap: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await onSubmit();
          setBusy(false);
          if (!r.ok) return setError(r.error);
          onClose();
          router.refresh();
        }}
      >
        {children}
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
        <button type="submit" className="fl-btn fl-btn-primary" disabled={busy}>
          {busy ? "…" : submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="fl-btn fl-btn-danger" disabled={busy} onClick={onDelete}>
            <Trash2 size={15} /> {deleteLabel ?? "Supprimer"}
          </button>
        )}
      </form>
    </ModalOverlay>
  );
}

/** Fenêtre « Es-tu sûr ? » (jamais fermée par un clic à côté). */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<Result>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalOverlay onClose={onClose} title={title}>
      <div style={{ display: "grid", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        {children}
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
        <button
          type="button"
          className="fl-btn fl-btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await onConfirm();
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onClose();
            router.refresh();
          }}
        >
          <Trash2 size={15} /> {busy ? "…" : confirmLabel}
        </button>
        <button type="button" className="fl-btn fl-btn-secondary" disabled={busy} onClick={onClose}>
          Annuler
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─────────────────────────────────────────────
// Fournisseur
// ─────────────────────────────────────────────

/** Groupe de champs (boutons, plusieurs lignes) avec son « ? » : un div, pas un label (un label enverrait le clic au premier bouton). */
function FieldGroup({ label, help, children }: { label: string; help: { title: string; text: React.ReactNode; example?: React.ReactNode }; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span className="fl-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        <Help title={help.title} example={help.example}>
          {help.text}
        </Help>
      </span>
      {children}
    </div>
  );
}

/** Sept boutons Lun … Dim à cocher. */
function DayPicker({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
      {JOURS.map((j) => {
        const on = value.includes(j.n);
        return (
          <button
            key={j.n}
            type="button"
            className="fl-chip"
            style={{ justifyContent: "center", padding: 0 }}
            aria-pressed={on}
            aria-label={j.nom}
            onClick={() => onChange(on ? value.filter((x) => x !== j.n) : [...value, j.n].sort((a, b) => a - b))}
          >
            {j.court}
          </button>
        );
      })}
    </div>
  );
}

type SupplierEdit = { id: number; name: string; note: string | null; orderDays?: number[]; deliveryDays?: number[]; contacts?: Contact[] };

/** Créer (sans `supplier`) ou modifier un fournisseur : nom, numéros à appeler, jours de commande et de livraison, remarque. */
export function SupplierFormModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: SupplierEdit;
  onClose: () => void;
  onSaved?: (id: number) => void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");
  const [orderDays, setOrderDays] = useState<number[]>(supplier?.orderDays ?? []);
  const [deliveryDays, setDeliveryDays] = useState<number[]>(supplier?.deliveryDays ?? []);
  const [contacts, setContacts] = useState<Contact[]>(supplier?.contacts?.length ? supplier.contacts : [{ nom: "", tel: "" }]);
  const setContact = (i: number, c: Partial<Contact>) => setContacts((l) => l.map((x, k) => (k === i ? { ...x, ...c } : x)));
  return (
    <FormModal
      title={supplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}
      submitLabel={supplier ? "Enregistrer" : "Créer le fournisseur"}
      onClose={onClose}
      onSubmit={async () => {
        const data = { name, note, orderDays, deliveryDays, contacts: contacts.filter((c) => c.tel.trim()) };
        if (supplier) {
          const r = await editSupplier(supplier.id, data);
          if (r.ok) onSaved?.(supplier.id);
          return r;
        }
        const r = await addSupplier(data);
        if (!r.ok) return r;
        onSaved?.(r.id);
        return { ok: true };
      }}
    >
      <Field
        label="Nom"
        help={{
          title: "Nom du fournisseur",
          text: "Le nom affiché dans le tableau des prix et sur les factures. Si tu le renommes, ses produits, ses prix et ses factures restent les mêmes.",
          example: "Metro, Promocash, Ribera et Fils",
        }}
      >
        <input className="fl-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!supplier} required maxLength={120} />
      </Field>
      <FieldGroup
        label="Numéros à appeler"
        help={{
          title: "Numéros à appeler",
          text: "Un ou plusieurs numéros de téléphone, avec qui répond (commercial, standard, livreur…). Sur la fiche du fournisseur, touche un numéro pour appeler directement depuis ton téléphone.",
          example: "Commercial : 06 12 34 56 78 · Standard : 04 66 51 60 06",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          {contacts.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 6 }}>
              <input
                className="fl-input"
                value={c.nom}
                placeholder="Qui (commercial…)"
                aria-label="Qui répond à ce numéro"
                maxLength={80}
                onChange={(e) => setContact(i, { nom: e.target.value })}
              />
              <input
                className="fl-input"
                type="tel"
                inputMode="tel"
                value={c.tel}
                placeholder="06 12 34 56 78"
                aria-label="Numéro de téléphone"
                maxLength={40}
                onChange={(e) => setContact(i, { tel: e.target.value })}
              />
              <button
                type="button"
                className="fl-btn fl-btn-ghost fl-btn-icon"
                aria-label="Retirer ce numéro"
                onClick={() => setContacts((l) => (l.length > 1 ? l.filter((_, k) => k !== i) : [{ nom: "", tel: "" }]))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {contacts.length < MAX_CONTACTS && (
            <button type="button" className="fl-btn fl-btn-ghost" style={{ justifySelf: "start" }} onClick={() => setContacts((l) => [...l, { nom: "", tel: "" }])}>
              <Plus size={15} /> Ajouter un numéro
            </button>
          )}
        </div>
      </FieldGroup>
      <FieldGroup
        label="Jours de commande"
        help={{
          title: "Jours de commande",
          text: "Les jours où tu passes commande chez ce fournisseur. Ces jours-là, il apparaît dans « À commander aujourd'hui » sur l'accueil et sur la page Commandes, avec un bouton pour commander. Laisse tout décoché pour ne pas avoir de rappel.",
          example: "Lun, Mer, Ven pour un fournisseur qui livre le lendemain.",
        }}
      >
        <DayPicker value={orderDays} onChange={setOrderDays} label="Jours de commande" />
      </FieldGroup>
      <FieldGroup
        label="Jours de livraison"
        help={{
          title: "Jours de livraison",
          text: "Les jours où ce fournisseur livre. Le rappel dit alors quand arrive la commande (« livré demain », « livré samedi »).",
          example: "Mar, Jeu, Sam",
        }}
      >
        <DayPicker value={deliveryDays} onChange={setDeliveryDays} label="Jours de livraison" />
      </FieldGroup>
      <Field
        label="Remarque"
        help={{
          title: "Remarque",
          text: "Ce que tu veux retenir sur ce fournisseur : minimum de commande, heure limite, code client…",
          example: "Commande avant 14 h, franco 150 €.",
        }}
      >
        <textarea className="fl-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
    </FormModal>
  );
}

/** Supprime un fournisseur après avoir dit exactement ce qui part avec lui. */
export function DeleteSupplierModal({ id, onClose, onDeleted }: { id: number; onClose: () => void; onDeleted: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getSupplierDeletionInfo>> | undefined>(undefined);
  useEffect(() => {
    getSupplierDeletionInfo(id).then(setInfo, () => setInfo(null));
  }, [id]);
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  return (
    <ConfirmModal
      title="Supprimer le fournisseur ?"
      confirmLabel="Supprimer définitivement"
      onClose={onClose}
      onConfirm={async () => {
        const r = await removeSupplier(id);
        if (r.ok) onDeleted();
        return r;
      }}
    >
      {info === undefined ? (
        <p style={{ color: "var(--muted)" }}>…</p>
      ) : info === null ? (
        <p>Fournisseur introuvable.</p>
      ) : (
        <>
          <p>
            <b>{info.name}</b> va être supprimé avec :
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>{plural(info.products, "produit et ses prix", "produits et tous leurs prix")}</li>
            <li>
              {plural(info.invoices, "facture", "factures")}
              {info.files ? ` (dont ${plural(info.files, "photo ou PDF joint", "photos ou PDF joints")})` : ""}
            </li>
            {info.manualPrices > 0 && <li>{plural(info.manualPrices, "prix tapé à la main", "prix tapés à la main")}</li>}
          </ul>
          {info.ingredients.length > 0 && (
            <p>
              Ces ingrédients des recettes prenaient leur prix ici : {info.ingredients.join(", ")}. Ils gardent leur dernier prix, qui
              devient un prix tapé à la main. Le coût des recettes ne change donc pas.
            </p>
          )}
          <p style={{ color: "var(--danger)" }}>On ne peut pas revenir en arrière.</p>
        </>
      )}
    </ConfirmModal>
  );
}

// ─────────────────────────────────────────────
// Produit
// ─────────────────────────────────────────────

export type EditableProduct = {
  id: number;
  name: string;
  reference: string | null;
  article: string | null;
  family: string | null;
  unit: string;
  packSize: number | null;
  /** Ce qu'on commande (carton, sac…), null = deviné d'après le nom. */
  packName?: string | null;
  /** A déjà des prix : l'unité ne change plus. */
  hasPrices: boolean;
};

const HELP = {
  name: {
    title: "Nom du produit",
    text: "Le nom exact, comme sur la facture (avec l'origine ou la marque). Pour comparer avec les autres fournisseurs, c'est « Comparer sous le nom » qui compte.",
    example: "Fraise Espagne cat I",
  },
  article: {
    title: "Comparer sous le nom",
    text: "Le nom commun qui sert à comparer ce produit avec les autres fournisseurs et à regrouper ses variantes. Mets le même nom qu'un article existant pour les réunir sur une ligne. Vide : le nom du produit.",
    example: "« Fraise » pour « Fraise France » et « Fraise Espagne » ; « Chocolat noir 64 % ».",
  },
  family: {
    title: "Famille",
    text: "Le rayon où ce produit est rangé dans le tableau des prix.",
    example: "Fruits et légumes, Crèmerie, Emballages",
  },
  unit: {
    title: "Prix au…",
    text: "Le prix est toujours ramené au kg, au litre ou à la pièce pour pouvoir comparer. Une fois qu'il y a des prix, l'unité ne change plus.",
    example: "Farine : au kg. Lait : au L. Boîtes à gâteau : à la pièce.",
  },
  packName: {
    title: "Commandé par",
    text: "Ce que tu commandes chez ce fournisseur : carton, sac, seau, kg… Ce sont les boutons proposés dans « Passer une commande ». Vide : deviné d'après le nom (« sac 25 kg » → sac).",
    example: "Croissants surgelés : carton. Farine T45 : sac. Fraises : kg.",
  },
  pack: {
    title: "Contenance d'un colis",
    text: "Combien il y a dans un colis acheté, dans l'unité du prix. Sert à afficher le prix du colis. Vide si tu ne sais pas.",
    example: "25 pour un sac de 25 kg, 50 pour un carton de 50 boîtes.",
  },
  reference: {
    title: "Référence",
    text: "Le code article du fournisseur, s'il y en a un sur la facture. Facultatif.",
    example: "REF 104522",
  },
  price: {
    title: "Prix",
    text: "Le prix payé, hors taxe, ramené à l'unité (au kg, au L ou à la pièce). Il est gardé dans l'historique à la date choisie et devient le prix actuel s'il est le plus récent.",
    example: "Sac de 25 kg payé 22,50 € : tape 0,90 (€ le kg).",
  },
  date: {
    title: "Date du prix",
    text: "Le jour où ce prix a été payé ou annoncé. L'historique est rangé par date.",
  },
  qty: {
    title: "Quantité achetée",
    text: "Combien de colis (ou de pièces) achetés à ce prix. Facultatif : sert seulement au montant.",
    example: "3 sacs",
  },
};

/** Créer (avec `supplierId`) ou modifier un produit d'un fournisseur. */
export function ProductFormModal({
  supplierId,
  product,
  onClose,
  onDelete,
}: {
  supplierId?: number;
  product?: EditableProduct;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [article, setArticle] = useState(product?.article ?? "");
  const [family, setFamily] = useState(product?.family ?? "");
  const [unit, setUnit] = useState<string>(product?.unit ?? "kg");
  const [pack, setPack] = useState(show(product?.packSize));
  const [reference, setReference] = useState(product?.reference ?? "");
  const [packName, setPackName] = useState(product?.packName ?? "");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today());

  return (
    <FormModal
      title={product ? "Modifier le produit" : "Nouveau produit"}
      submitLabel={product ? "Enregistrer" : "Ajouter le produit"}
      onClose={onClose}
      onDelete={onDelete}
      deleteLabel="Supprimer ce produit"
      onSubmit={async () => {
        const packSize = parseNumber(pack);
        if (packSize != null && !(packSize > 0)) return { ok: false, error: "Contenance invalide." };
        const data = { name, article, family, reference, packSize, packName: packName.trim() || null, unit: unit as PriceUnit };
        if (product) return editProduct(product.id, data);
        const p = parseNumber(price);
        if (p != null && !(p >= 0)) return { ok: false, error: "Prix invalide." };
        return addProduct(supplierId!, { ...data, price: p, date });
      }}
    >
      <Field label="Nom du produit" help={HELP.name}>
        <input className="fl-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!product} maxLength={300} />
      </Field>
      <div style={two}>
        <Field label="Comparer sous le nom" help={HELP.article}>
          <input className="fl-input" value={article} placeholder={name || "Fraise"} onChange={(e) => setArticle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Famille" help={HELP.family}>
          <input className="fl-input" list="sup-families-form" value={family} placeholder="Autres" onChange={(e) => setFamily(e.target.value)} />
          <datalist id="sup-families-form">
            {SUPPLIER_FAMILIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
      </div>
      <div style={two}>
        <Field label="Prix au…" help={HELP.unit}>
          <select className="fl-input" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={product?.hasPrices}>
            {PRICE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === "pièce" ? "à la pièce" : u === "L" ? "au litre" : "au kg"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contenance d'un colis" help={HELP.pack}>
          <input className="fl-input" inputMode="decimal" value={pack} placeholder={unit === "pièce" ? "50" : "25"} onChange={(e) => setPack(e.target.value)} />
        </Field>
      </div>
      <div style={two}>
        <Field label="Commandé par" help={HELP.packName}>
          <input
            className="fl-input"
            list="sup-pack-names"
            value={packName}
            placeholder={packNameOf({ name, packSize: parseNumber(pack), priceUnit: unit })}
            onChange={(e) => setPackName(e.target.value)}
            maxLength={40}
          />
          <datalist id="sup-pack-names">
            {PACK_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Référence" help={HELP.reference}>
          <input className="fl-input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </Field>
      </div>
      {!product && (
        <div style={two}>
          <Field label={`Prix (€ / ${unit})`} help={HELP.price}>
            <input className="fl-input" inputMode="decimal" value={price} placeholder="Facultatif" onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Date du prix" help={HELP.date}>
            <input className="fl-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
      )}
    </FormModal>
  );
}

/** Supprime un produit (confirmation). */
export function DeleteProductModal({ product, onClose, onDeleted }: { product: { id: number; name: string; prices: number; invoices: number }; onClose: () => void; onDeleted?: () => void }) {
  return (
    <ConfirmModal
      title="Supprimer ce produit ?"
      confirmLabel="Supprimer le produit"
      onClose={onClose}
      onConfirm={async () => {
        const r = await removeProduct(product.id);
        if (r.ok) onDeleted?.();
        return r;
      }}
    >
      <p>
        <b>{product.name}</b> et {product.prices > 1 ? `ses ${product.prices} prix` : product.prices === 1 ? "son prix" : "sa fiche"} vont être supprimés.
      </p>
      {product.invoices > 0 && (
        <p>
          Il est aussi retiré {product.invoices > 1 ? `des ${product.invoices} factures` : "de la facture"} où il apparaît (le total écrit sur
          la facture ne change pas).
        </p>
      )}
      <p>Si un ingrédient des recettes prenait ce prix, il garde son dernier prix.</p>
    </ConfirmModal>
  );
}

// ─────────────────────────────────────────────
// Prix
// ─────────────────────────────────────────────

export type EditablePrice = {
  lineId: number;
  price: number;
  date: string;
  quantity: number | null;
  /** Prix tapé à la main : sa date se change ici. Sinon c'est un prix de facture. */
  manual: boolean;
  invoiceNumber?: string | null;
};

/** Ajouter un prix à un produit (avec `productId`) ou corriger un prix de l'historique (avec `price`). */
export function PriceFormModal({
  productId,
  productName,
  unit,
  price,
  onClose,
}: {
  productId?: number;
  productName: string;
  unit: string;
  price?: EditablePrice;
  onClose: () => void;
}) {
  const [value, setValue] = useState(show(price?.price));
  const [date, setDate] = useState(price?.date ?? today());
  const [qty, setQty] = useState(show(price?.quantity));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateEditable = !price || price.manual;

  if (confirmDelete && price) {
    return (
      <ConfirmModal
        title="Supprimer ce prix ?"
        confirmLabel="Supprimer le prix"
        onClose={onClose}
        onConfirm={() => removePrice(price.lineId)}
      >
        <p>
          Le prix de {formatEuro(price.price)} /{unit} du {new Date(price.date).toLocaleDateString("fr-FR")} pour <b>{productName}</b> sort de
          l&apos;historique.
          {price.manual ? "" : " Il est aussi retiré de sa facture."}
        </p>
        <p>Le produit reste, avec ses autres prix.</p>
      </ConfirmModal>
    );
  }

  return (
    <FormModal
      title={price ? "Corriger le prix" : "Ajouter un prix"}
      submitLabel={price ? "Enregistrer" : "Ajouter le prix"}
      onClose={onClose}
      onDelete={price ? () => setConfirmDelete(true) : undefined}
      deleteLabel="Supprimer ce prix"
      onSubmit={async () => {
        const p = parseNumber(value);
        if (p == null || !(p >= 0)) return { ok: false, error: "Tape un prix." };
        const q = parseNumber(qty);
        if (q != null && !(q > 0)) return { ok: false, error: "Quantité invalide." };
        if (!price) return addPrice(productId!, { price: p, date, quantity: q });
        return editPrice(price.lineId, { price: p, quantity: q, ...(dateEditable ? { date } : {}) });
      }}
    >
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        {productName}
        {price && !price.manual ? ` · facture${price.invoiceNumber ? ` n° ${price.invoiceNumber}` : ""}` : ""}
      </p>
      <div style={two}>
        <Field label={`Prix (€ / ${unit})`} help={HELP.price}>
          <input className="fl-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
        </Field>
        <Field
          label="Date"
          help={
            dateEditable
              ? HELP.date
              : { title: "Date du prix", text: "C'est la date de la facture. Pour la changer, ouvre la facture et touche « Modifier »." }
          }
        >
          <input className="fl-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!dateEditable} required />
        </Field>
      </div>
      <Field label="Quantité achetée" help={HELP.qty}>
        <input className="fl-input" inputMode="decimal" value={qty} placeholder="Facultatif" onChange={(e) => setQty(e.target.value)} />
      </Field>
    </FormModal>
  );
}

// ─────────────────────────────────────────────
// Facture
// ─────────────────────────────────────────────

/** Corriger la date, le numéro, le total ou la remarque d'une facture. */
export function InvoiceFormModal({
  order,
  onClose,
}: {
  order: { id: number; date: string; number: string | null; total: number | null; note: string | null };
  onClose: () => void;
}) {
  const [date, setDate] = useState(order.date);
  const [number, setNumber] = useState(order.number ?? "");
  const [total, setTotal] = useState(show(order.total));
  const [note, setNote] = useState(order.note ?? "");
  return (
    <FormModal
      title="Modifier la facture"
      onClose={onClose}
      onSubmit={async () => {
        const t = parseNumber(total);
        if (t != null && !(t >= 0)) return { ok: false, error: "Total invalide." };
        return editInvoice(order.id, { date, number, total: t, note });
      }}
    >
      <div style={two}>
        <Field
          label="Date"
          help={{ title: "Date de la facture", text: "Tous les prix de cette facture sont rangés à cette date dans l'historique." }}
        >
          <input className="fl-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Numéro" help={{ title: "Numéro de facture", text: "Le numéro écrit sur la facture. Il évite d'enregistrer deux fois la même." }}>
          <input className="fl-input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={100} />
        </Field>
      </div>
      <Field
        label="Total HT (€)"
        help={{ title: "Total HT", text: "Le total hors taxe écrit sur la facture. Vide : le site additionne les lignes." }}
      >
        <input className="fl-input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
      </Field>
      <Field label="Remarque" help={{ title: "Remarque", text: "Ce que tu veux retenir sur cette facture (livraison incomplète, avoir…)." }}>
        <textarea className="fl-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
    </FormModal>
  );
}
