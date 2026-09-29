/**
 * `URL.createObjectURL` keeps its Blob alive until revoked, not until
 * garbage collected. `exportService.ts` and `TwoFactorSettings.tsx` both
 * revoke theirs immediately after one `<a>` click; this component's URL has
 * to survive for playback and download, so it has to be revoked wherever the
 * recording is discarded instead — on delete, on a successful transcription,
 * and on unmount. Before the fix it was created once per recording and never
 * revoked at all: `setAudioURL("")` drops the component's only reference to
 * it but leaves the browser holding the recording in memory regardless.
 *
 * These tests drive the real component, with `MediaRecorder` and
 * `getUserMedia` stubbed (jsdom has neither) and `URL.createObjectURL` /
 * `revokeObjectURL` spied on rather than mocked away, so a fix that revokes
 * the wrong URL or skips a path still fails these.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { VoiceMemo } from "./VoiceMemo";

const transcribeMock = vi.hoisted(() => vi.fn());
const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: { ai: { transcribe: { mutate: transcribeMock } } },
    }),
  },
}));

vi.mock("@/lib/exportService", () => ({
  downloadBlob: downloadBlobMock,
}));

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(private stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {}

  stop() {
    this.ondataavailable?.({
      data: new Blob(["chunk"], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
}

let createdURLs: string[] = [];
let revokedURLs: string[] = [];

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  createdURLs = [];
  revokedURLs = [];
  transcribeMock.mockReset();
  downloadBlobMock.mockReset();

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

  const stopTrack = vi.fn();
  const fakeStream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
    configurable: true,
  });

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:fake-${createdURLs.length}`;
    createdURLs.push(url);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedURLs.push(url);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function recordAndStop() {
  render(<VoiceMemo onTranscription={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /stop recording/i })
    ).not.toBeNull()
  );

  fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
  await waitFor(() => expect(createdURLs.length).toBeGreaterThan(0));
}

describe("recording lifecycle", () => {
  it("creates exactly one object URL per recording, for playback", async () => {
    await recordAndStop();

    expect(createdURLs).toHaveLength(1);
    // Throws if the row isn't there — proof enough that a Delete control
    // exists for the recording just made.
    screen.getByRole("button", { name: /delete recording/i });
  });

  it("revokes the recording's URL on delete, not just clears the reference", async () => {
    await recordAndStop();
    expect(revokedURLs).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /delete recording/i }));

    expect(revokedURLs).toEqual(createdURLs);
    // Back to the empty state — nothing left to leak on a second recording.
    screen.getByRole("button", { name: /start recording/i });
  });

  it("revokes the recording's URL after a successful transcription", async () => {
    transcribeMock.mockResolvedValue({ text: "hello" });
    await recordAndStop();

    fireEvent.click(screen.getByRole("button", { name: /^transcribe$/i }));

    await waitFor(() => expect(revokedURLs).toEqual(createdURLs));
  });

  it("revokes the recording's URL on unmount, so leaving the page does not leak it", async () => {
    const { unmount } = render(<VoiceMemo onTranscription={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /stop recording/i })
      ).not.toBeNull()
    );
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await waitFor(() => expect(createdURLs.length).toBeGreaterThan(0));

    expect(revokedURLs).toHaveLength(0);
    unmount();
    expect(revokedURLs).toEqual(createdURLs);
  });

  it("does not revoke anything when the panel unmounts with no recording made", () => {
    const { unmount } = render(<VoiceMemo onTranscription={vi.fn()} />);
    unmount();
    expect(revokedURLs).toHaveLength(0);
  });
});

describe("downloading a recording", () => {
  it("goes through the shared downloadBlob helper with the recorded blob", async () => {
    await recordAndStop();

    fireEvent.click(screen.getByRole("button", { name: /download audio/i }));

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlobMock.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/^voice-memo-\d+\.webm$/);
  });
});
