import { Notice } from "obsidian";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE, emptyDraft, type DraftState, type StoredAttachment } from "../domain/entry";
import { createEntryIdentity } from "../domain/identity";
import type { RecoveryReport } from "../storage/recovery-service";
import { Timeline } from "./Timeline";
import { Composer } from "./Composer";
import { appendGeneratedContent, type ComposeRequestBridge } from "./compose-request-bridge";
import { StreamIcon } from "./StreamIcon";
import type { StreamServices } from "./types";

export interface StreamAppProps {
  services: StreamServices;
  composeRequests: ComposeRequestBridge;
}

function withoutError(draft: DraftState): DraftState {
  const next = { ...draft, phase: "draft" as const, updatedAt: Date.now() };
  delete next.error;
  return next;
}

function isEmptyDraft(draft: DraftState): boolean {
  return !draft.identity && !draft.body && draft.tags.length === 0 && draft.attachments.length === 0 && draft.phase === "draft";
}

export function StreamApp({ services, composeRequests }: StreamAppProps) {
  const [draft, setDraft] = useState<DraftState>(() => services.drafts.load());
  const [entries, setEntries] = useState(() => services.index.getEntries());
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(draft.error ?? null);
  const [scrollToNewestSignal, setScrollToNewestSignal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null);
  const [composing, setComposing] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const atNewest = useRef(true);
  const composeButtonRef = useRef<HTMLButtonElement>(null);
  const draftRef = useRef(draft);
  const sendingRef = useRef(sending);
  draftRef.current = draft;
  sendingRef.current = sending;

  const consumeComposeRequests = useCallback(() => {
    if (sendingRef.current) return;
    const requests = composeRequests.drain();
    if (requests.length === 0) return;
    const updatedAt = Date.now();
    setDraft((current) => requests.reduce(
      (next, request) => appendGeneratedContent(next, request.markdown, updatedAt),
      current
    ));
    setError(null);
    setComposing(true);
    setFocusRequestId(requests.at(-1)?.id ?? 0);
  }, [composeRequests]);

  const persistDraft = useCallback((current: DraftState) => {
    if (isEmptyDraft(current)) services.drafts.clear();
    else services.drafts.save(current);
  }, [services.drafts]);

  const showTimeline = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => composeButtonRef.current?.focus());
  }, []);

  const closeComposer = useCallback(() => {
    persistDraft(draftRef.current);
    showTimeline();
  }, [persistDraft, showTimeline]);

  useEffect(() => {
    const unsubscribe = services.index.subscribe((reason) => {
      setEntries([...services.index.getEntries()]);
      if (reason === "create") {
        if (atNewest.current) setScrollToNewestSignal((value) => value + 1);
        else setNewCount((value) => value + 1);
      }
    });
    return unsubscribe;
  }, [services.index]);

  useEffect(() => composeRequests.subscribe(consumeComposeRequests), [composeRequests, consumeComposeRequests]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistDraft(draft);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, persistDraft]);

  useEffect(() => () => persistDraft(draftRef.current), [persistDraft]);

  useEffect(() => {
    const ids = services.index.getEntryIds();
    if (draft.identity) ids.add(draft.identity.id);
    setRecovery(services.recovery.scan(ids, services.index.malformedEntryCount, draft));
  }, [draft.phase, draft.identity, entries, services.index, services.recovery]);

  useEffect(() => {
    if (!composing) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || sending || composerBusy) return;
      event.preventDefault();
      closeComposer();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeComposer, composerBusy, composing, sending]);

  const visibleEntries = entries.slice(-loadedCount).reverse();

  const mutateDraft = (mutator: (current: DraftState) => DraftState) => {
    setDraft((current) => withoutError(mutator(current)));
    setError(null);
  };

  const addImages = async (files: File[]) => {
    const identity = draft.identity ?? createEntryIdentity();
    if (!draft.identity) mutateDraft((current) => ({ ...current, identity }));
    for (const file of files) {
      const stored = await services.attachments.writeFile(identity, "image", file, file.name);
      mutateDraft((current) => ({ ...current, identity, attachments: [...current.attachments, stored] }));
    }
  };

  const addAudio = async (blob: Blob) => {
    const identity = draft.identity ?? createEntryIdentity();
    const extension = blob.type.includes("webm") ? "recording.webm" : blob.type.includes("ogg") ? "recording.ogg" : "recording.m4a";
    const stored = await services.attachments.writeFile(identity, "audio", blob, extension);
    mutateDraft((current) => ({ ...current, identity, attachments: [...current.attachments, stored] }));
  };

  const removeAttachment = (attachment: StoredAttachment) => {
    mutateDraft((current) => ({
      ...current,
      attachments: current.attachments.filter((item) => item.path !== attachment.path)
    }));
  };

  const send = async () => {
    setError(null);
    const outcome = services.commands.interpret(draft.body, draft.tags);
    if (outcome.kind === "error") {
      setError(outcome.message);
      return;
    }
    if (outcome.kind === "draft") {
      mutateDraft((current) => ({ ...current, body: outcome.body, tags: outcome.tags }));
      return;
    }

    const identity = draft.identity ?? createEntryIdentity();
    sendingRef.current = true;
    setSending(true);
    setDraft((current) => ({ ...current, identity, body: outcome.body, tags: outcome.tags, phase: "committing", updatedAt: Date.now() }));
    try {
      await services.capture.submit({
        identity,
        body: outcome.body,
        tags: outcome.tags,
        attachments: draft.attachments
      });
      const clearedDraft = emptyDraft();
      draftRef.current = clearedDraft;
      setDraft(clearedDraft);
      try {
        await services.index.rebuild("create");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        new Notice(`Post saved, but the timeline could not refresh: ${message}`);
      }
      setNewCount(0);
      setScrollToNewestSignal((value) => value + 1);
      showTimeline();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setDraft((current) => ({ ...current, phase: "error", error: message, updatedAt: Date.now() }));
      setError(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
      consumeComposeRequests();
    }
  };

  const showRecovery = recovery && (recovery.pendingDraft || recovery.orphanAttachmentCount > 0 || recovery.malformedEntryCount > 0);

  return (
    <div className="personal-stream-app">
      <div className="personal-stream-history-wrap" aria-hidden={composing} inert={composing}>
        <Timeline
          entries={visibleEntries}
          hasEarlier={entries.length > visibleEntries.length}
          services={services}
          scrollToNewestSignal={scrollToNewestSignal}
          onLoadEarlier={() => setLoadedCount((count) => count + PAGE_SIZE)}
          onAtNewestChange={(value) => {
            atNewest.current = value;
            if (value) setNewCount(0);
          }}
        />
        {newCount > 0 && (
          <button type="button" className="personal-stream-new-pill" onClick={() => {
            setNewCount(0);
            setScrollToNewestSignal((value) => value + 1);
          }}>{newCount} new ↑</button>
        )}
      </div>
      <button
        ref={composeButtonRef}
        type="button"
        className={`personal-stream-compose-button${showRecovery ? " has-recovery" : ""}`}
        aria-label={showRecovery ? "Compose a new post; recovery information is available" : "Compose a new post"}
        aria-hidden={composing}
        onClick={() => setComposing(true)}
        disabled={composing}
      >
        <StreamIcon name="plus" />
      </button>
      {composing && (
        <section className="personal-stream-compose-layer" aria-label="Compose a new post">
          <div className="personal-stream-compose-panel">
            <div className="personal-stream-compose-header">
              <button
                type="button"
                className="personal-stream-compose-close"
                aria-label="Close composer; draft is saved"
                onClick={closeComposer}
                disabled={sending || composerBusy}
              >
                <StreamIcon name="x" />
              </button>
            </div>
            {showRecovery && (
              <div className="personal-stream-recovery-banner" role="status">
                {recovery.pendingDraft && <span>Pending send preserved.</span>}
                {recovery.orphanAttachmentCount > 0 && <span>{recovery.orphanAttachmentCount} recoverable attachment set(s).</span>}
                {recovery.malformedEntryCount > 0 && <span>{recovery.malformedEntryCount} malformed entry file(s).</span>}
              </div>
            )}
            <Composer
              draft={draft}
              services={services}
              focusRequestId={focusRequestId}
              sending={sending}
              error={error}
              onBodyChange={(body) => mutateDraft((current) => ({ ...current, body }))}
              onRemoveTag={(tag) => mutateDraft((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}
              onAddImages={addImages}
              onAddAudio={addAudio}
              onRemoveAttachment={removeAttachment}
              onSend={send}
              onBusyChange={setComposerBusy}
            />
          </div>
        </section>
      )}
    </div>
  );
}
