"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const QUEUE_KEY = "cookstash-offline-shopping-updates-v1";

type OfflineQueue = Record<string, boolean>;

function readQueue(): OfflineQueue {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const out: OfflineQueue = {};
    for (const [itemId, value] of Object.entries(parsed)) {
      if (typeof itemId === "string" && typeof value === "boolean") {
        out[itemId] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeQueue(queue: OfflineQueue) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function flushQueue() {
  const queue = readQueue();
  const updates = Object.entries(queue).map(([itemId, isChecked]) => ({ itemId, isChecked }));
  if (updates.length === 0) {
    return;
  }

  const response = await fetch("/api/shopping-list-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });

  if (!response.ok) {
    throw new Error("Failed to sync offline list changes");
  }

  writeQueue({});
}

type Props = {
  itemId: string;
  initialChecked: boolean;
  initialSkipped: boolean;
  itemText: string;
};

export function OfflineShoppingItemToggle({ itemId, initialChecked, initialSkipped, itemText }: Props) {
  const [checked, setChecked] = useState(initialChecked);
  const [skipped, setSkipped] = useState(initialSkipped);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !window.navigator.onLine;
  });

  const syncPendingChanges = useCallback(async () => {
    if (typeof window === "undefined" || !window.navigator.onLine) {
      return;
    }

    setIsSyncing(true);
    try {
      await flushQueue();
      setSyncError(null);
    } catch {
      setSyncError("Offline changes pending sync.");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      setIsOffline(false);
      void syncPendingChanges();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const rafId = window.requestAnimationFrame(() => {
      void syncPendingChanges();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingChanges]);

  const itemClassName = useMemo(
    () => (checked || skipped ? "text-zinc-400 line-through" : ""),
    [checked, skipped],
  );

  async function onToggle() {
    const nextChecked = !checked;
    setChecked(nextChecked);
    setSkipped(false);
    setSyncError(null);

    if (typeof window === "undefined") {
      return;
    }

    const queue = readQueue();
    queue[itemId] = nextChecked;
    writeQueue(queue);

    if (!window.navigator.onLine) {
      setIsOffline(true);
      return;
    }

    try {
      const response = await fetch("/api/shopping-list-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          isChecked: nextChecked,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to update checklist item");
      }

      const latestQueue = readQueue();
      if (latestQueue[itemId] === nextChecked) {
        delete latestQueue[itemId];
        writeQueue(latestQueue);
      }
    } catch {
      setSyncError("Offline changes pending sync.");
    }
  }

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => void onToggle()}
        className="mt-0.5 h-4 w-4 rounded border"
        aria-label={checked ? "Mark unchecked" : "Mark checked"}
      >
        {checked ? "✓" : ""}
      </button>
      <span className={itemClassName}>
        {itemText}
        {skipped ? <span className="text-zinc-500"> (skipped)</span> : null}
      </span>
      {(isOffline || isSyncing || syncError) && (
        <span className="text-xs text-zinc-500">{syncError ?? (isSyncing ? "Syncing..." : "Offline mode")}</span>
      )}
    </div>
  );
}
