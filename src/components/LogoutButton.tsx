"use client";

import { useTransition } from "react";
import { logout } from "@/app/actions/accounts";

export function LogoutButton({
  label = "Se déconnecter",
  className = "fl-btn fl-btn-secondary",
}: {
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => start(() => logout())}
    >
      {pending ? "..." : label}
    </button>
  );
}
