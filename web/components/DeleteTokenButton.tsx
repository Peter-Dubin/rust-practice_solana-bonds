"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTokenAction } from "@/app/token/actions";

export function DeleteTokenButton({ tokenId }: { tokenId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this token record? The on-chain mint will remain but the DB entry will be removed.")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTokenAction(tokenId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        disabled={busy}
        onClick={handleDelete}
        className="text-red-400 hover:underline disabled:opacity-50"
      >
        {busy ? "…" : "Delete"}
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
    </span>
  );
}
