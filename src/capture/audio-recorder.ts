const MAX_RECORDING_MS = 10 * 60 * 1_000;

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

export class AudioRecorderService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private completion: Promise<Blob> | null = null;
  private maximumTimer: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private forcingStop = false;
  private onForcedStop: ((blob: Blob) => void) | null = null;
  private onForcedError: ((error: Error) => void) | null = null;

  get supported(): boolean {
    return typeof navigator.mediaDevices !== "undefined" && typeof MediaRecorder !== "undefined";
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(onForcedStop: (blob: Blob) => void, onForcedError: (error: Error) => void): Promise<void> {
    if (!this.supported) throw new Error("Audio recording is not supported by this Obsidian WebView.");
    if (this.recorder) throw new Error("Audio recording is already active.");

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredMimeType();
    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.onForcedStop = onForcedStop;
    this.onForcedError = onForcedError;

    this.completion = new Promise<Blob>((resolve, reject) => {
      const recorder = this.recorder!;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      });
      recorder.addEventListener(
        "error",
        () => reject(new Error("The audio recorder encountered an error.")),
        { once: true }
      );
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type: recorder.mimeType || mimeType || "audio/mp4" });
          this.cleanup();
          if (blob.size <= 0) reject(new Error("The audio recording was empty."));
          else resolve(blob);
        },
        { once: true }
      );
    });

    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") void this.forceStop();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.maximumTimer = window.setTimeout(() => void this.forceStop(), MAX_RECORDING_MS);
    this.recorder.start(1_000);
  }

  async stop(): Promise<Blob> {
    if (!this.recorder || !this.completion) throw new Error("No audio recording is active.");
    const completion = this.completion;
    if (this.recorder.state !== "inactive") this.recorder.stop();
    return completion;
  }

  async cancel(): Promise<void> {
    if (!this.recorder || !this.completion) {
      this.cleanup();
      return;
    }
    const completion = this.completion;
    if (this.recorder.state !== "inactive") this.recorder.stop();
    try {
      await completion;
    } catch {
      // Cancellation deliberately discards the result.
    }
  }

  dispose(): void {
    void this.cancel();
  }

  private async forceStop(): Promise<void> {
    if (this.forcingStop || !this.recorder) return;
    this.forcingStop = true;
    try {
      const blob = await this.stop();
      this.onForcedStop?.(blob);
    } catch (error) {
      this.onForcedError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.forcingStop = false;
    }
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.maximumTimer !== null) window.clearTimeout(this.maximumTimer);
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.completion = null;
    this.maximumTimer = null;
    this.visibilityHandler = null;
  }
}
