/**
 * Firefox refuses to start an HTML5 drag at all unless `dataTransfer.setData`
 * is called during `dragstart` — a spec requirement Chrome does not enforce,
 * which is exactly why a Chromium-only sandbox like this one would never
 * catch it. `handleNoteDragStart` and `handleFolderDragStart` tracked the
 * dragged item entirely through React state and never called `setData`, so
 * dragging a note or folder would silently fail to even begin in Firefox,
 * with every drop handler here unreachable as a result.
 *
 * jsdom does not implement a real `DataTransfer`, so `fireEvent.dragStart`
 * is given a fake one to spy on — this is testing that the component calls
 * the API correctly, not that jsdom's drag-and-drop matches a real browser's.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { Folder, Note } from "@/lib/storage";

function fakeDataTransfer() {
  return {
    setData: vi.fn(),
    effectAllowed: "",
  } as unknown as DataTransfer;
}

function baseProps() {
  const folder: Folder = {
    id: "folder-1",
    name: "Work",
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: 0,
  };
  const note: Note = {
    id: "note-1",
    title: "Meeting notes",
    content: "",
    folderId: folder.id,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isEncrypted: false,
    order: 0,
  };

  return {
    folders: [folder],
    notes: [note],
    currentNote: null,
    encryptionKey: null,
    onSelectNote: vi.fn(),
    onCreateNote: vi.fn(),
    onCreateFolder: vi.fn(),
    onDeleteNote: vi.fn(),
    onDeleteFolder: vi.fn(),
    onUpdateFolder: vi.fn(),
    onNotesChange: vi.fn(),
    onFoldersChange: vi.fn(),
  };
}

beforeEach(() => {
  // A browser that has never used the sidebar sees its root folders open —
  // see sidebarState.ts. Clearing this between tests keeps that default.
  localStorage.clear();
});

describe("starting a drag", () => {
  it("calls dataTransfer.setData for a note, not just effectAllowed", async () => {
    const props = baseProps();
    render(<Sidebar {...props} />);

    const noteRow = (await screen.findByText("Meeting notes")).closest(
      '[draggable="true"]'
    );
    expect(noteRow).not.toBeNull();

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(noteRow as Element, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalled();
  });

  it("calls dataTransfer.setData for a folder, not just effectAllowed", async () => {
    const props = baseProps();
    render(<Sidebar {...props} />);

    const folderRow = (await screen.findByText("Work")).closest(
      '[draggable="true"]'
    );
    expect(folderRow).not.toBeNull();

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(folderRow as Element, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalled();
  });
});
