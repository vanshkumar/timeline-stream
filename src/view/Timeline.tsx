import { useLayoutEffect, useRef } from "react";
import { capturedLocalDate } from "../domain/identity";
import type { EntrySummary } from "../domain/entry";
import type { StreamServices } from "./types";
import { EntryCard } from "./EntryCard";

export interface TimelineProps {
  entries: EntrySummary[];
  hasEarlier: boolean;
  services: StreamServices;
  scrollSignal: number;
  onLoadEarlier(): void;
  onAtBottomChange(atBottom: boolean): void;
}

function dayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

export function Timeline({ entries, hasEarlier, services, scrollSignal, onLoadEarlier, onAtBottomChange }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const preserveHeight = useRef<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || entries.length === 0) return;
    if (!initialized.current) {
      container.scrollTop = container.scrollHeight;
      initialized.current = true;
    } else if (preserveHeight.current !== null) {
      container.scrollTop += container.scrollHeight - preserveHeight.current;
      preserveHeight.current = null;
    }
  }, [entries]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [scrollSignal]);

  const loadEarlier = () => {
    if (containerRef.current) preserveHeight.current = containerRef.current.scrollHeight;
    onLoadEarlier();
  };

  const handleScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    onAtBottomChange(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
  };

  let previousDay = "";
  return (
    <div className="personal-stream-timeline" ref={containerRef} onScroll={handleScroll}>
      {hasEarlier && (
        <button type="button" className="personal-stream-load-earlier" onClick={loadEarlier}>Load earlier</button>
      )}
      {entries.length === 0 && <div className="personal-stream-empty">Nothing here yet. Send yourself the first note.</div>}
      {entries.map((entry) => {
        const day = capturedLocalDate(entry.createdAt);
        const divider = day !== previousDay;
        previousDay = day;
        return (
          <div key={entry.path}>
            {divider && <div className="personal-stream-day-divider"><span>{dayLabel(day)}</span></div>}
            <EntryCard summary={entry} services={services} />
          </div>
        );
      })}
    </div>
  );
}
