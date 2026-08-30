import { Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef } from "react";
import type { App } from "obsidian";

export interface MarkdownCardProps {
  app: App;
  markdown: string;
  sourcePath: string;
}

export function MarkdownCard({ app, markdown, sourcePath }: MarkdownCardProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.empty();
    const component = new Component();
    component.load();
    void MarkdownRenderer.render(app, markdown, element, sourcePath, component);
    return () => component.unload();
  }, [app, markdown, sourcePath]);

  return <div className="personal-stream-markdown markdown-rendered" ref={elementRef} />;
}
