import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE, emptyDraft, type DraftState, type StoredAttachment } from "../domain/entry";
import { createEntryIdentity, formatRfc3339 } from "../domain/identity";
import type { RecoveryReport } from "../storage/recovery-service";
import { Timeline } from "./Timeline";
import { Composer } from "./Composer";
import type { StreamServices } from "./types";

export interface StreamAppProps {
  services: StreamServices;
}

function withoutError(draft: DraftState): DraftState {
  const next = { ...draft, phase: "draft" as const, updatedAt: Date.now() };
  delete next.error;
  return next;
}

export function StreamApp({ services }: StreamAppProps) {
  const [draft, setDraft] = useState<DraftState>(() => services.drafts.load());
  const [entries, setEntries] = useState(() => services.index.getEntries());
  const [query, setQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(draft.error ?? null);
  const [scrollSignal, setScrollSignal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    const unsubscribe = services.index.subscribe((reason) => {
      setEntries([...services.index.getEntries()]);
      if (reason === "create") {
        if (atBottom.current) setScrollSignal((value) => value + 1);
        else setNewCount((value) => value + 1);
      }
    });
    return unsubscribe;
  }, [services.index]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const isEmpty = !draft.identity && !draft.body && draft.tags.length === 0 && draft.attachments.length === 0 && draft.phase === "draft";
      if (isEmpty) services.drafts.clear();
      else services.drafts.save(draft);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, services.drafts]);

  useEffect(() => {
    const ids = services.index.getEntryIds();
    if (draft.identity) ids.add(draft.identity.id);
    setRecovery(services.recovery.scan(ids, services.index.malformedEntryCount, draft));
  }, [draft.phase, draft.identity, entries, services.index, services.recovery]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!query.trim()) {
        setSearchMatches(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      void services.search
        .search(entries, query, controller.signal)
        .then(setSearchMatches)
        .catch((caught) => {
          if (!(caught instanceof DOMException && caught.name === "AbortError")) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [entries, query, services.search]);

  useEffect(() => {
    setLoadedCount(PAGE_SIZE);
    setScrollSignal((value) => value + 1);
  }, [query, selectedTag, todayOnly]);

  const allTags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort((left, right) => left.localeCompare(right)),
    [entries]
  );
  const today = formatRfc3339(new Date()).slice(0, 10);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => {
      if (todayOnly && entry.createdAt.slice(0, 10) !== today) return false;
      if (selectedTag && !entry.tags.includes(selectedTag)) return false;
      if (searchMatches && !searchMatches.has(entry.path)) return false;
      return true;
    }),
    [entries, searchMatches, selectedTag, today, todayOnly]
  );
  const visibleEntries = filteredEntries.slice(-loadedCount);

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
    if (outcome.kind === "action") {
      setTodayOnly(true);
      mutateDraft((current) => ({ ...current, body: "" }));
      return;
    }
    if (outcome.kind === "draft") {
      mutateDraft((current) => ({ ...current, body: outcome.body, tags: outcome.tags }));
      return;
    }

    const identity = draft.identity ?? createEntryIdentity();
    setSending(true);
    setDraft((current) => ({ ...current, identity, body: outcome.body, tags: outcome.tags, phase: "committing", updatedAt: Date.now() }));
    try {
      await services.capture.submit({
        identity,
        body: outcome.body,
        tags: outcome.tags,
        attachments: draft.attachments
      });
      setDraft(emptyDraft());
      await services.index.rebuild("create");
      setScrollSignal((value) => value + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setDraft((current) => ({ ...current, phase: "error", error: message, updatedAt: Date.now() }));
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const showRecovery = recovery && (recovery.pendingDraft || recovery.orphanAttachmentCount > 0 || recovery.malformedEntryCount > 0);

  return (
    <div className="personal-stream-app">
      <header className="personal-stream-header">
        <div className="personal-stream-title-row">
          <h1>Stream</h1>
          <button type="button" className={todayOnly ? "is-active" : ""} onClick={() => setTodayOnly((value) => !value)}>Today</button>
        </div>
        <div className="personal-stream-filters">
          <input
            type="search"
            placeholder="Search entries"
            aria-label="Search stream entries"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <select aria-label="Filter by tag" value={selectedTag} onChange={(event) => setSelectedTag(event.currentTarget.value)}>
            <option value="">All tags</option>
            {allTags.map((tag) => <option value={tag} key={tag}>#{tag}</option>)}
          </select>
          {searching && <span className="personal-stream-searching">Searching…</span>}
        </div>
        {showRecovery && (
          <div className="personal-stream-recovery-banner">
            {recovery.pendingDraft && <span>Pending send preserved.</span>}
            {recovery.orphanAttachmentCount > 0 && <span>{recovery.orphanAttachmentCount} recoverable attachment set(s).</span>}
            {recovery.malformedEntryCount > 0 && <span>{recovery.malformedEntryCount} malformed entry file(s).</span>}
          </div>
        )}
      </header>
      <div className="personal-stream-history-wrap">
        <Timeline
          entries={visibleEntries}
          hasEarlier={filteredEntries.length > visibleEntries.length}
          services={services}
          scrollSignal={scrollSignal}
          onLoadEarlier={() => setLoadedCount((count) => count + PAGE_SIZE)}
          onAtBottomChange={(value) => {
            atBottom.current = value;
            if (value) setNewCount(0);
          }}
        />
        {newCount > 0 && (
          <button type="button" className="personal-stream-new-pill" onClick={() => {
            setNewCount(0);
            setScrollSignal((value) => value + 1);
          }}>{newCount} new ↓</button>
        )}
      </div>
      <Composer
        draft={draft}
        services={services}
        sending={sending}
        error={error}
        onBodyChange={(body) => mutateDraft((current) => ({ ...current, body }))}
        onRemoveTag={(tag) => mutateDraft((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}
        onAddImages={addImages}
        onAddAudio={addAudio}
        onRemoveAttachment={removeAttachment}
        onSend={send}
      />
    </div>
  );
}
