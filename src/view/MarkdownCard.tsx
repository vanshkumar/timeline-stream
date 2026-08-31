import { Component, Keymap, MarkdownRenderer, Notice } from "obsidian";
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
    const openInternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 && event.button !== 1) return;
      const ElementConstructor = element.ownerDocument.defaultView?.Element;
      if (!ElementConstructor || !(event.target instanceof ElementConstructor)) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a.internal-link");
      const linktext = link?.getAttribute("data-href") || link?.getAttribute("href");
      if (!linktext) return;
      event.preventDefault();
      void app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(event)).catch((caught) => {
        const message = caught instanceof Error ? caught.message : String(caught);
        new Notice(`Could not open linked note: ${message}`);
      });
    };
    component.registerDomEvent(element, "click", openInternalLink);
    component.registerDomEvent(element, "auxclick", openInternalLink);
    void MarkdownRenderer.render(app, markdown, element, sourcePath, component);
    return () => component.unload();
  }, [app, markdown, sourcePath]);

  return <div className="personal-stream-markdown markdown-rendered" ref={elementRef} />;
}
