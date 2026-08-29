import { LogoutButton } from "@/components/LogoutButton";

export default function RefusedPage() {
  return (
    <div className="fl-card flex flex-col gap-4 items-center text-center">
      <h1 className="fl-title-serif" style={{ fontSize: "1.5rem", color: "var(--danger)" }}>
        Demande refusée
      </h1>
      <p className="fl-label" style={{ color: "var(--text)" }}>
        Un administrateur a refusé ta demande d'accès.
        Si tu penses qu'il s'agit d'une erreur, contacte-le directement.
      </p>
      <div className="mt-2">
        <LogoutButton />
      </div>
    </div>
  );
}
