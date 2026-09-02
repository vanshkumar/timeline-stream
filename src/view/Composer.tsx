import { Notice } from "obsidian";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DraftState, StoredAttachment } from "../domain/entry";
import { StreamIcon } from "./StreamIcon";
import type { StreamServices } from "./types";

export interface ComposerProps {
  draft: DraftState;
  services: StreamServices;
  focusRequestId: number;
  sending: boolean;
  error: string | null;
  onBodyChange(body: string): void;
  onRemoveTag(tag: string): void;
  onAddImages(files: File[]): Promise<void>;
  onAddAudio(blob: Blob): Promise<void>;
  onRemoveAttachment(attachment: StoredAttachment): void;
  onSend(): Promise<void>;
  onBusyChange(busy: boolean): void;
}

function isHeic(path: string): boolean {
  return /\.(heic|heif)$/i.test(path);
}

function AttachmentChip({ attachment, services, onRemove }: {
  attachment: StoredAttachment;
  services: StreamServices;
  onRemove(): void;
}) {
  const resource = services.attachments.resourcePath(attachment.path);
  return (
    <div className="personal-stream-attachment-chip">
      {attachment.kind === "image" && resource && !isHeic(attachment.path) && (
        <img src={resource} alt="Draft attachment preview" />
      )}
      {attachment.kind === "audio" && resource && <audio controls preload="none" src={resource} />}
      <div className="personal-stream-attachment-label">
        {isHeic(attachment.path)
          ? "HEIC photo attached; preview unavailable"
          : attachment.kind === "image" ? "Photo attached" : "Audio attached"}
      </div>
      <button type="button" aria-label="Remove attachment from draft" onClick={onRemove}>×</button>
    </div>
  );
}

export function Composer({
  draft,
  services,
  focusRequestId,
  sending,
  error,
  onBodyChange,
  onRemoveTag,
  onAddImages,
  onAddAudio,
  onRemoveAttachment,
  onSend,
  onBusyChange
}: ComposerProps) {
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaStatus, setMediaStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const previousAttachmentCountRef = useRef(draft.attachments.length);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft.body]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusRequestId]);

  useLayoutEffect(() => {
    const previousCount = previousAttachmentCountRef.current;
    previousAttachmentCountRef.current = draft.attachments.length;
    if (draft.attachments.length <= previousCount) return;
    const frame = window.requestAnimationFrame(() => {
      attachmentsRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", inline: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft.attachments.length]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    onBusyChange(mediaBusy || recording);
    return () => onBusyChange(false);
  }, [mediaBusy, onBusyChange, recording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void services.audioRecorder.cancel();
    };
  }, [services.audioRecorder]);

  const suggestions = useMemo(() => {
    const first = draft.body.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
    if (!first.startsWith("/") || first.startsWith("//") || first.includes(" ")) return [];
    const prefix = first.slice(1).toLowerCase();
    return services.commands.list().filter((command) => command.name.startsWith(prefix));
  }, [draft.body, services.commands]);

  const pickImages = async (camera: boolean) => {
    setMediaBusy(true);
    setMediaError(null);
    setMediaStatus(camera ? "Opening camera…" : "Opening photos…");
    try {
      const files = await services.imagePicker.pick(camera);
      if (files.length > 0) {
        setMediaStatus(files.length === 1 ? "Attaching photo…" : `Attaching ${files.length} photos…`);
        await onAddImages(files);
        if (mountedRef.current) {
          setMediaStatus(files.length === 1 ? "Photo attached." : `${files.length} photos attached.`);
        }
      } else if (mountedRef.current) {
        setMediaStatus(null);
      }
    } catch (caught) {
      setMediaStatus(null);
      setMediaError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (mountedRef.current) {
        setMediaBusy(false);
      }
    }
  };

  const finishRecording = async (blob: Blob) => {
    setRecording(false);
    setRecordingSeconds(0);
    setMediaBusy(true);
    try {
      await onAddAudio(blob);
    } catch (caught) {
      setMediaError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setMediaBusy(false);
    }
  };

  const startRecording = async () => {
    setMediaBusy(true);
    setMediaError(null);
    try {
      await services.audioRecorder.start(
        (blob) => void finishRecording(blob),
        (caught) => {
          if (!mountedRef.current) return;
          setRecording(false);
          setMediaError(caught.message);
        }
      );
      if (!mountedRef.current) {
        await services.audioRecorder.cancel();
        return;
      }
      setRecordingSeconds(0);
      setRecording(true);
    } catch (caught) {
      if (!mountedRef.current) return;
      setMediaError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (mountedRef.current) setMediaBusy(false);
    }
  };

  const stopRecording = async () => {
    setMediaBusy(true);
    try {
      await finishRecording(await services.audioRecorder.stop());
    } catch (caught) {
      setRecording(false);
      setMediaError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setMediaBusy(false);
    }
  };

  const cancelRecording = async () => {
    setMediaBusy(true);
    setRecording(false);
    setRecordingSeconds(0);
    try {
      await services.audioRecorder.cancel();
    } finally {
      if (mountedRef.current) setMediaBusy(false);
    }
  };

  const canSend = !sending && !mediaBusy && !recording && (draft.body.trim().length > 0 || draft.attachments.length > 0);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      if (event.nativeEvent.isComposing || !canSend) return;
      event.preventDefault();
      void onSend();
    }
  };

  useEffect(() => {
    if (sending || !error) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [error, sending]);

  return (
    <div className="personal-stream-composer">
      <div className="personal-stream-avatar personal-stream-composer-avatar" aria-hidden="true">🧠</div>
      <div className="personal-stream-composer-content">
        {draft.tags.length > 0 && (
          <div className="personal-stream-draft-tags">
            {draft.tags.map((tag) => (
              <button type="button" key={tag} onClick={() => onRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>#{tag} ×</button>
            ))}
          </div>
        )}
        {draft.attachments.length > 0 && (
          <div
            ref={attachmentsRef}
            className="personal-stream-draft-attachments"
            aria-label="Attached media"
            aria-live="polite"
          >
            {draft.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.path}
                attachment={attachment}
                services={services}
                onRemove={() => {
                  setMediaStatus(null);
                  onRemoveAttachment(attachment);
                  new Notice("Removed from draft; the captured file was retained for recovery.");
                }}
              />
            ))}
          </div>
        )}
        <div className="personal-stream-media-status" role="status" aria-atomic="true">{mediaStatus}</div>
        <div className="personal-stream-composer-input-wrap">
          <textarea
            ref={inputRef}
            className="personal-stream-composer-input"
            aria-label="Write to your personal stream"
            placeholder="Write to your stream…"
            rows={1}
            autoFocus
            value={draft.body}
            onChange={(event) => onBodyChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="personal-stream-command-suggestions">
            {suggestions.map((command) => (
              <button type="button" key={command.name} onClick={() => onBodyChange(`/${command.name} `)}>
                <strong>/{command.name}</strong><span>{command.description}</span>
              </button>
            ))}
          </div>
        )}
        {(error || mediaError) && <div className="personal-stream-inline-error" role="alert">{error ?? mediaError}</div>}
        {recording && (
          <div className="personal-stream-recording">
            <span className="personal-stream-recording-dot" /> Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
            <button type="button" onClick={() => void cancelRecording()} disabled={mediaBusy || sending}>Cancel</button>
          </div>
        )}
        <div className="personal-stream-composer-actions">
          <button
            type="button"
            className="personal-stream-composer-tool"
            onClick={() => void pickImages(false)}
            disabled={mediaBusy || recording || sending}
            aria-label="Choose photos"
          >
            <StreamIcon name="image" />
            <span className="personal-stream-composer-action-label">Photos</span>
          </button>
          <button
            type="button"
            className="personal-stream-composer-tool"
            onClick={() => void pickImages(true)}
            disabled={mediaBusy || recording || sending}
            aria-label="Take photo"
          >
            <StreamIcon name="camera" />
            <span className="personal-stream-composer-action-label">Camera</span>
          </button>
          <button
            type="button"
            onClick={() => void (recording ? stopRecording() : startRecording())}
            disabled={mediaBusy || sending || (!recording && !services.audioRecorder.supported)}
            aria-label={recording ? "Stop recording" : "Record audio"}
            className={`personal-stream-composer-tool${recording ? " is-recording" : ""}`}
          >
            <StreamIcon name={recording ? "square" : "mic"} />
            <span className="personal-stream-composer-action-label">{recording ? "Stop" : "Audio"}</span>
          </button>
          <button type="button" className="personal-stream-send mod-cta" onClick={() => void onSend()} disabled={!canSend} aria-label="Send entry">
            {sending ? "…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
