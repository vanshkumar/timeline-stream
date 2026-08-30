import { Notice } from "obsidian";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DraftState, StoredAttachment } from "../domain/entry";
import type { StreamServices } from "./types";

export interface ComposerProps {
  draft: DraftState;
  services: StreamServices;
  sending: boolean;
  error: string | null;
  onBodyChange(body: string): void;
  onRemoveTag(tag: string): void;
  onAddImages(files: File[]): Promise<void>;
  onAddAudio(blob: Blob): Promise<void>;
  onRemoveAttachment(attachment: StoredAttachment): void;
  onSend(): Promise<void>;
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
        {isHeic(attachment.path) ? "HEIC saved; preview may be unavailable" : attachment.kind === "image" ? "Image" : "Audio"}
      </div>
      <button type="button" aria-label="Remove attachment from draft" onClick={onRemove}>×</button>
    </div>
  );
}

export function Composer({
  draft,
  services,
  sending,
  error,
  onBodyChange,
  onRemoveTag,
  onAddImages,
  onAddAudio,
  onRemoveAttachment,
  onSend
}: ComposerProps) {
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft.body]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    void services.audioRecorder.cancel();
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
    try {
      const files = await services.imagePicker.pick(camera);
      if (files.length > 0) await onAddImages(files);
    } catch (caught) {
      setMediaError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setMediaBusy(false);
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
    setMediaError(null);
    try {
      await services.audioRecorder.start(
        (blob) => void finishRecording(blob),
        (caught) => {
          setRecording(false);
          setMediaError(caught.message);
        }
      );
      setRecordingSeconds(0);
      setRecording(true);
    } catch (caught) {
      setMediaError(caught instanceof Error ? caught.message : String(caught));
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
    await services.audioRecorder.cancel();
    setRecording(false);
    setRecordingSeconds(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void onSend();
    }
  };

  const canSend = !sending && !mediaBusy && !recording && (draft.body.trim().length > 0 || draft.attachments.length > 0);

  return (
    <div className="personal-stream-composer">
      {draft.tags.length > 0 && (
        <div className="personal-stream-draft-tags">
          {draft.tags.map((tag) => (
            <button type="button" key={tag} onClick={() => onRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>#{tag} ×</button>
          ))}
        </div>
      )}
      {draft.attachments.length > 0 && (
        <div className="personal-stream-draft-attachments">
          {draft.attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.path}
              attachment={attachment}
              services={services}
              onRemove={() => {
                onRemoveAttachment(attachment);
                new Notice("Removed from draft; the captured file was retained for recovery.");
              }}
            />
          ))}
        </div>
      )}
      <div className="personal-stream-composer-input-wrap">
        <textarea
          ref={inputRef}
          className="personal-stream-composer-input"
          aria-label="Write to your personal stream"
          placeholder="Write to your stream…"
          rows={1}
          value={draft.body}
          onChange={(event) => onBodyChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="personal-stream-command-suggestions">
          {suggestions.map((command) => (
            <button type="button" key={command.name} onClick={() => onBodyChange(`/${command.name}${command.name === "today" ? "" : " "}`)}>
              <strong>/{command.name}</strong><span>{command.description}</span>
            </button>
          ))}
        </div>
      )}
      {(error || mediaError) && <div className="personal-stream-inline-error">{error ?? mediaError}</div>}
      {recording && (
        <div className="personal-stream-recording">
          <span className="personal-stream-recording-dot" /> Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
          <button type="button" onClick={() => void cancelRecording()}>Cancel</button>
        </div>
      )}
      <div className="personal-stream-composer-actions">
        <button type="button" onClick={() => void pickImages(false)} disabled={mediaBusy || recording || sending} aria-label="Choose photos">
          ＋ Photos
        </button>
        <button type="button" onClick={() => void pickImages(true)} disabled={mediaBusy || recording || sending} aria-label="Take photo">
          📷 Camera
        </button>
        <button
          type="button"
          onClick={() => void (recording ? stopRecording() : startRecording())}
          disabled={mediaBusy || sending || (!recording && !services.audioRecorder.supported)}
          aria-label={recording ? "Stop recording" : "Record audio"}
          className={recording ? "is-recording" : ""}
        >
          {recording ? "■ Stop" : "🎙 Audio"}
        </button>
        <button type="button" className="personal-stream-send mod-cta" onClick={() => void onSend()} disabled={!canSend} aria-label="Send entry">
          {sending ? "…" : "↑"}
        </button>
      </div>
    </div>
  );
}
