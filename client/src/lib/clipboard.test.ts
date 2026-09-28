/**
 * `copyToClipboard` exists because of a cross-browser gap that six components
 * hit independently: `navigator.clipboard.writeText` is not something a
 * caller can assume succeeded just because it was called. Two components had
 * already discovered this by hand before this file existed — see the git
 * history for `EncryptionKey.tsx` and `TwoFactorSettings.tsx` — and four
 * others told the user "Copied" whether or not it actually landed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: originalClipboard,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("when the clipboard API works", () => {
  it("returns true and actually writes the text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    expect(await copyToClipboard("the phrase")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("the phrase");
  });
});

describe("when the browser refuses", () => {
  it("returns false rather than throwing, when writeText rejects", async () => {
    // Firefox and Safari both reject in ordinary situations a component
    // cannot avoid: no direct user gesture, a permission prompt dismissed, a
    // document that lost focus between the click and the await.
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new DOMException("denied")),
      },
      configurable: true,
    });

    await expect(copyToClipboard("secret")).resolves.toBe(false);
  });

  it("returns false rather than throwing, when clipboard is undefined", async () => {
    // The state of a page served over plain HTTP — `navigator.clipboard`
    // does not exist at all, so `navigator.clipboard.writeText` throws a
    // TypeError before any permission question is even asked.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    await expect(copyToClipboard("secret")).resolves.toBe(false);
  });
});
