"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--secondary btn--sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/v1/staff-auth/logout", { method: "POST" });
        } finally {
          window.location.assign("/masuk");
        }
      }}
    >
      <Icon name="logout" />
      Keluar
    </button>
  );
}
