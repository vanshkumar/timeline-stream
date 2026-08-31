import { useLayoutEffect, useRef } from "react";
import { capturedLocalDate } from "../domain/identity";
import type { EntrySummary } from "../domain/entry";
import type { StreamServices } from "./types";
import { EntryCard } from "./EntryCard";

export interface TimelineProps {
  entries: EntrySummary[];
  hasEarlier: boolean;
  services: StreamServices;
  scrollToNewestSignal: number;
  onLoadEarlier(): void;
  onAtNewestChange(atNewest: boolean): void;
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

export function Timeline({ entries, hasEarlier, services, scrollToNewestSignal, onLoadEarlier, onAtNewestChange }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollToNewestSignal]);

  const handleScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    onAtNewestChange(element.scrollTop < 80);
  };

  let previousDay = "";
  return (
    <div className="personal-stream-timeline" ref={containerRef} onScroll={handleScroll}>
      {entries.length === 0 && <div className="personal-stream-empty">Nothing here yet. Use + to post your first note.</div>}
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
      {hasEarlier && (
        <button type="button" className="personal-stream-load-earlier" onClick={onLoadEarlier}>Load earlier</button>
      )}
    </div>
  );
}
