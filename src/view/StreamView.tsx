import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { StreamApp } from "./StreamApp";
import type { StreamServices } from "./types";

export const STREAM_VIEW_TYPE = "personal-stream-view";

export class StreamView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly services: StreamServices
  ) {
    super(leaf);
  }

  getViewType(): string {
    return STREAM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Personal Stream";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("personal-stream-view");
    this.root = createRoot(this.contentEl);
    this.root.render(<StreamApp services={this.services} />);
  }

  async onClose(): Promise<void> {
    this.services.audioRecorder.dispose();
    this.root?.unmount();
    this.root = null;
  }

  focusComposer(): void {
    window.requestAnimationFrame(() => {
      this.contentEl.querySelector<HTMLTextAreaElement>(".personal-stream-composer-input")?.focus();
    });
  }
}
