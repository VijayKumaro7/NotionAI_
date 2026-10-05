/**
 * The footer's "press ... to open this help" tip hardcoded the literal text
 * `Cmd+?`, while every shortcut listed above it went through `formatKeys`,
 * which reads `navigator.platform` and renders `Ctrl` rather than `Cmd` on
 * anything that isn't a Mac. A Windows or Linux user saw a key combination
 * their keyboard does not have for the one shortcut that opens this dialog —
 * everywhere else in the file already got this right.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ShortcutsModal from "./ShortcutsModal";

const setPlatform = (platform: string) => {
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true,
  });
};

const realPlatform = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "platform"
);

afterEach(() => {
  cleanup();
  if (realPlatform) {
    Object.defineProperty(navigator, "platform", realPlatform);
  }
});

describe("the footer's open-this-help tip", () => {
  // The <kbd> in the footer is the only one on the page — the shortcut list
  // above it renders its own keys in a plain <div>, not a <kbd> — so this is
  // unambiguously the footer tip and not the "Help" row in the list, which
  // happens to format to the same text and would otherwise collide with a
  // plain text query. Queried from document.body rather than the render
  // container: Radix's Dialog portals its content there directly.
  it("shows Ctrl, not Cmd, on a non-Mac platform", () => {
    setPlatform("Win32");
    render(<ShortcutsModal isOpen={true} onClose={() => {}} />);

    expect(document.querySelector("kbd")?.textContent).toBe("Ctrl+?");
  });

  it("shows the Mac symbol on a Mac platform", () => {
    setPlatform("MacIntel");
    render(<ShortcutsModal isOpen={true} onClose={() => {}} />);

    expect(document.querySelector("kbd")?.textContent).toBe("⌘?");
  });
});
