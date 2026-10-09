/**
 * Deleting a folder must not orphan the notes filed on it directly.
 *
 * `folderTree.test.ts` covers `reparentNotes` and `promoteChildren` as pure
 * functions; this is the wiring in `removeFolder` around them — which folder
 * a note's `folderId` actually becomes, and whether a folder that has to be
 * created first (the workspace's last one, being deleted) is actually
 * persisted before the notes depending on it are saved. `pnpm check` cannot
 * see either: TypeScript is satisfied by a destination id that is a string,
 * whether or not a row with that id was ever written.
 *
 * No sync mocking beyond the bare shape `useNotes` needs to import: folder
 * deletion is a local operation, and `isAuthenticated` stays false throughout
 * so nothing here depends on a server round trip.
 *
 * Unlike the sync test files, this one wants the *default* per-test
 * behaviour `vitest.setup.ts` already gives every test — a fresh, empty
 * `IDBFactory` each time — rather than one shared across the file. The
 * "deleting the only folder left" case below means nothing unless the store
 * really does start with nothing else in it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        notes: {
          pull: { query: async () => [] },
          push: { mutate: async () => ({ ok: true }) },
        },
      },
    }),
  },
}));

import { useNotes } from "./useNotes";
import {
  DB_NAME,
  closeDB,
  initializeDB,
  saveFolder,
  saveNote,
  getNote,
  getAllFolders,
  type Note,
  type Folder,
} from "@/lib/storage";

/**
 * A fresh database per test, not just a fresh `IDBFactory`.
 *
 * `vitest.setup.ts` swaps `globalThis.indexedDB` for an empty one before every
 * test, but `storage.ts` caches the *connection* it opened against the old
 * one in a module variable, and every function in this file reaches for that
 * cached connection first (`db || await initializeDB()`) rather than noticing
 * the swap. Left alone, every test after the first keeps writing into the
 * first test's database — this file's own "deleting the only folder left"
 * case is not that case at all if an earlier test's folders are quietly still
 * in there. `keyPortability.test.ts` names the same fix for the same reason.
 */
beforeEach(async () => {
  closeDB();
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  await initializeDB();
});

function folderRow(id: string, parentId: string | null): Folder {
  return {
    id,
    name: id,
    parentId,
    createdAt: 1_000,
    updatedAt: 1_000,
    order: 0,
  };
}

function noteRow(id: string, folderId: string): Note {
  return {
    id,
    title: id,
    content: "unencrypted for this test — the folderId is what matters",
    folderId,
    tags: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    isEncrypted: false,
    order: 0,
  };
}

/** Seeds without a key, and preserving the timestamp — `saveNote` stamps
 * `Date.now()` by default, which every "did this note move" check here would
 * otherwise be unable to tell apart from a real move. */
const seedNote = (n: Note) =>
  saveNote(n, undefined, { preserveTimestamp: true });

/**
 * `isLoading` turns false once folders, the key, deleted notes and tags are
 * loaded — but `notes` itself stays empty until something calls
 * `loadAllNotes`. That call is not inside `useNotes` at all: it is
 * `NotesApp.tsx`'s job, done in an effect once folders exist and `notes` is
 * still empty. A bare `renderHook(() => useNotes())`, with no page around it,
 * never runs that effect, so mounting the hook alone leaves `notes` at `[]`
 * forever — and `removeFolder`, reading `notesRef.current`, would then
 * reparent nothing because there is nothing there yet to reparent. Calling it
 * here is standing in for the page component, not a shortcut past it.
 */
async function mount() {
  const view = renderHook(() => useNotes());
  await waitFor(() => expect(view.result.current.encryptionKey).not.toBeNull());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  await act(() => view.result.current.loadAllNotes());
  return view;
}

describe("removeFolder", () => {
  it("reparents a folder's own notes to its parent, alongside promoting its subfolders", async () => {
    await saveFolder(folderRow("grand", null));
    await saveFolder(folderRow("parent", "grand"));
    await saveFolder(folderRow("child", "parent"));
    await seedNote(noteRow("in-parent", "parent"));
    await seedNote(noteRow("in-child", "child"));

    const view = await mount();
    await act(() => view.result.current.removeFolder("parent"));

    const folders = view.result.current.folders;
    expect(folders.find(f => f.id === "parent")).toBeUndefined();
    expect(folders.find(f => f.id === "child")?.parentId).toBe("grand");

    // The note filed directly on the deleted folder moves to its parent —
    // read back from storage, not just React state, so this proves the write
    // landed rather than only the in-memory model agreeing with itself.
    const moved = await getNote("in-parent");
    expect(moved?.folderId).toBe("grand");

    // A note inside the *subfolder* was never on the deleted folder itself;
    // its own folder still exists (moved, not gone), so it is untouched.
    const untouched = await getNote("in-child");
    expect(untouched?.folderId).toBe("child");
  });

  it("reparents a root folder's notes to a sibling root folder that survives", async () => {
    await saveFolder(folderRow("a", null));
    await saveFolder(folderRow("b", null));
    await seedNote(noteRow("in-a", "a"));

    const view = await mount();
    await act(() => view.result.current.removeFolder("a"));

    expect(view.result.current.folders.map(f => f.id)).toEqual(["b"]);

    const moved = await getNote("in-a");
    expect(moved?.folderId).toBe("b");
  });

  it("creates a fresh folder when deleting the only one left, and never leaves that note without one", async () => {
    await saveFolder(folderRow("only", null));
    await seedNote(noteRow("the-note", "only"));

    const view = await mount();
    await act(() => view.result.current.removeFolder("only"));

    const folders = view.result.current.folders;
    expect(folders).toHaveLength(1);
    expect(folders[0].id).not.toBe("only");
    expect(folders[0].parentId).toBeNull();

    // Persisted, not just held in state — a reload must find the same folder
    // the note now points at.
    const onDisk = await getAllFolders();
    expect(onDisk.map(f => f.id)).toEqual([folders[0].id]);

    const moved = await getNote("the-note");
    expect(moved?.folderId).toBe(folders[0].id);
  });

  it("does not touch notes that were never in the deleted folder", async () => {
    await saveFolder(folderRow("gone", null));
    await saveFolder(folderRow("staying", null));
    await seedNote(noteRow("elsewhere", "staying"));

    const view = await mount();
    await act(() => view.result.current.removeFolder("gone"));

    const untouched = await getNote("elsewhere");
    expect(untouched?.folderId).toBe("staying");
    expect(untouched?.updatedAt).toBe(1_000);
  });
});
