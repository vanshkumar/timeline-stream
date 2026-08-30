import { Notice } from "obsidian";
import { useEffect, useState } from "react";
import type { EntrySummary, ParsedEntry } from "../domain/entry";
import type { StreamServices } from "./types";
import { MarkdownCard } from "./MarkdownCard";
import { EditSheet } from "./EditSheet";
import { confirmDelete } from "./modals";

export interface EntryCardProps {
  summary: EntrySummary;
  services: StreamServices;
}

function timeLabel(createdAt: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(createdAt));
}

export function EntryCard({ summary, services }: EntryCardProps) {
  const [entry, setEntry] = useState<ParsedEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      setEntry(await services.repository.readDocument(summary.path));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    if (!editing) void load();
  }, [summary.path, summary.mtime, editing]);

  const copy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      new Notice("Entry Markdown copied.");
    } catch {
      new Notice("Clipboard access was unavailable. Open the note to copy it.");
    }
  };

  const duplicate = async () => {
    try {
      await services.repository.duplicate(summary.path);
      await services.index.rebuild("create");
      new Notice("Entry duplicated.");
    } catch (caught) {
      new Notice(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const remove = async () => {
    if (!(await confirmDelete(services.app, timeLabel(summary.createdAt)))) return;
    try {
      await services.repository.trash(summary.path);
      await services.index.rebuild("change");
    } catch (caught) {
      new Notice(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const saveEdit = async (body: string) => {
    if (!entry) return;
    const updated = await services.repository.editBody(summary.path, entry.raw, body);
    setEntry(updated);
    setEditing(false);
    await services.index.rebuild("change");
  };

  return (
    <article className="personal-stream-entry" data-stream-path={summary.path}>
      <button
        type="button"
        className="personal-stream-time"
        onClick={() => void services.repository.open(summary.path)}
        aria-label={`Open entry from ${timeLabel(summary.createdAt)}`}
      >
        {timeLabel(summary.createdAt)}
      </button>
      <div className="personal-stream-entry-content">
        {summary.conflict !== "none" && (
          <div className={`personal-stream-conflict is-${summary.conflict}`}>
            {summary.conflict === "identical"
              ? `${summary.duplicateCount} identical iCloud files share this entry ID`
              : "Conflicting iCloud variants share this entry ID"}
          </div>
        )}
        {error && <div className="personal-stream-inline-error">{error}</div>}
        {!entry && !error && <div className="personal-stream-loading">Loading…</div>}
        {entry && <MarkdownCard app={services.app} markdown={entry.body} sourcePath={entry.path} />}
      </div>
      <details className="personal-stream-entry-menu">
        <summary aria-label="Entry actions">•••</summary>
        <div className="personal-stream-entry-menu-items">
          <button type="button" onClick={() => void services.repository.open(summary.path)}>Open note</button>
          <button type="button" onClick={() => setEditing(true)} disabled={!entry}>Edit</button>
          <button type="button" onClick={() => void copy()} disabled={!entry}>Copy</button>
          <button type="button" onClick={() => void duplicate()}>Duplicate</button>
          <button type="button" className="mod-warning" onClick={() => void remove()}>Delete</button>
        </div>
      </details>
      {entry && (
        <EditSheet open={editing} body={entry.body} onCancel={() => setEditing(false)} onSave={saveEdit} />
      )}
    </article>
  );
}
