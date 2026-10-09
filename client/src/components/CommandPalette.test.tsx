/**
 * `lib/shortcuts.ts` has declared "command-palette" (Cmd+/) since the list
 * existed, `ShortcutsModal` has always advertised it, and
 * `useKeyboardShortcuts` even special-cases it to fire while typing in a
 * note — the same treatment given to Help and Search. Nothing behind any of
 * that ever opened anything, because no command palette existed. This is
 * its first test.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileText, FolderPlus } from "lucide-react";
import { CommandPalette, type CommandAction } from "./CommandPalette";

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

function commands(overrides: Partial<Record<string, () => void>> = {}) {
  const newNote = overrides["new-note"] ?? vi.fn();
  const newFolder = overrides["new-folder"] ?? vi.fn();
  const list: CommandAction[] = [
    {
      id: "new-note",
      label: "New Note",
      icon: FileText,
      enabled: true,
      run: newNote,
    },
    {
      id: "new-folder",
      label: "New Folder",
      icon: FolderPlus,
      enabled: true,
      run: newFolder,
    },
    {
      id: "share-note",
      label: "Share Note",
      icon: FileText,
      enabled: false, // no note open — not reachable
      run: vi.fn(),
    },
  ];
  return { list, newNote, newFolder };
}

describe("CommandPalette", () => {
  it("lists only enabled commands", () => {
    const { list } = commands();
    render(<CommandPalette isOpen={true} onClose={() => {}} commands={list} />);

    expect(screen.getByText("New Note")).toBeTruthy();
    expect(screen.getByText("New Folder")).toBeTruthy();
    expect(screen.queryByText("Share Note")).toBeNull();
  });

  it("filters the list as the query changes", () => {
    const { list } = commands();
    render(<CommandPalette isOpen={true} onClose={() => {}} commands={list} />);

    const input = screen.getByPlaceholderText("Type a command...");
    fireEvent.change(input, { target: { value: "folder" } });

    expect(screen.queryByText("New Note")).toBeNull();
    expect(screen.getByText("New Folder")).toBeTruthy();
  });

  it("shows a message when nothing matches", () => {
    const { list } = commands();
    render(<CommandPalette isOpen={true} onClose={() => {}} commands={list} />);

    fireEvent.change(screen.getByPlaceholderText("Type a command..."), {
      target: { value: "nonexistent" },
    });

    expect(screen.getByText("No matching commands")).toBeTruthy();
  });

  it("runs the clicked command and closes", () => {
    const onClose = vi.fn();
    const { list, newFolder } = commands();
    render(<CommandPalette isOpen={true} onClose={onClose} commands={list} />);

    fireEvent.click(screen.getByText("New Folder"));

    expect(newFolder).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown moves the selection, and Enter runs the selected command", () => {
    const onClose = vi.fn();
    const { list, newFolder, newNote } = commands();
    render(<CommandPalette isOpen={true} onClose={onClose} commands={list} />);

    const input = screen.getByPlaceholderText("Type a command...");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // New Note -> New Folder
    fireEvent.keyDown(input, { key: "Enter" });

    expect(newFolder).toHaveBeenCalledTimes(1);
    expect(newNote).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp wraps from the first command to the last", () => {
    const onClose = vi.fn();
    const { list, newFolder } = commands();
    render(<CommandPalette isOpen={true} onClose={onClose} commands={list} />);

    const input = screen.getByPlaceholderText("Type a command...");
    fireEvent.keyDown(input, { key: "ArrowUp" }); // New Note -> wraps to New Folder
    fireEvent.keyDown(input, { key: "Enter" });

    expect(newFolder).toHaveBeenCalledTimes(1);
  });

  it("resets the query and selection each time it is reopened", () => {
    const { list } = commands();
    const { rerender } = render(
      <CommandPalette isOpen={true} onClose={() => {}} commands={list} />
    );

    fireEvent.change(screen.getByPlaceholderText("Type a command..."), {
      target: { value: "folder" },
    });
    expect(screen.queryByText("New Note")).toBeNull();

    rerender(
      <CommandPalette isOpen={false} onClose={() => {}} commands={list} />
    );
    rerender(
      <CommandPalette isOpen={true} onClose={() => {}} commands={list} />
    );

    expect(
      (screen.getByPlaceholderText("Type a command...") as HTMLInputElement)
        .value
    ).toBe("");
    expect(screen.getByText("New Note")).toBeTruthy();
  });

  it("shows the platform-correct key combo for a command with a declared shortcut", () => {
    setPlatform("Win32");
    const { list } = commands();
    render(<CommandPalette isOpen={true} onClose={() => {}} commands={list} />);

    // "new-note" is Cmd+N in lib/shortcuts.ts.
    expect(screen.getByText("Ctrl+N")).toBeTruthy();
  });
});
