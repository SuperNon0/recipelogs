import { LogoutButton } from "@/components/LogoutButton";

export default function BlockedPage() {
  return (
    <div className="fl-card flex flex-col gap-4 items-center text-center">
      <h1 className="fl-title-serif" style={{ fontSize: "1.5rem", color: "var(--danger)" }}>
        Accès suspendu
      </h1>
      <p className="fl-label" style={{ color: "var(--text)" }}>
        Ton accès à RecipeLog a été suspendu par un administrateur.
        Contacte-le pour plus d'informations.
      </p>
      <div className="mt-2">
        <LogoutButton />
      </div>
    </div>
  );
}
