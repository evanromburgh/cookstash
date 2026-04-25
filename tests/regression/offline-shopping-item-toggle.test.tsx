import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineShoppingItemToggle } from "@/components/offline-shopping-item-toggle";

const QUEUE_KEY = "cookstash-offline-shopping-updates-v1";

describe("offline queue + sync behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("queues updates while offline and flushes latest value when online", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    render(
      <OfflineShoppingItemToggle
        itemId="item-1"
        initialChecked={false}
        initialSkipped={false}
        itemText="Milk"
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "Mark checked" });
    fireEvent.click(toggleButton);
    fireEvent.click(screen.getByRole("button", { name: "Mark unchecked" }));

    const queued = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "{}");
    expect(queued).toEqual({ "item-1": false });
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shopping-list-items",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ updates: [{ itemId: "item-1", isChecked: false }] }),
        }),
      );
    });

    expect(window.localStorage.getItem(QUEUE_KEY)).toBe("{}");
  });
});
