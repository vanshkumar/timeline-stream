import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { ComposeRequestBridge } from "./compose-request-bridge";
import { StreamApp } from "./StreamApp";
import type { StreamServices } from "./types";

export const STREAM_VIEW_TYPE = "personal-stream-view";

export class StreamView extends ItemView {
  private root: Root | null = null;
  private readonly composeRequests = new ComposeRequestBridge();

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

  requestCompose(markdown: string): void {
    this.composeRequests.request(markdown);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("personal-stream-view");
    this.root = createRoot(this.contentEl);
    this.root.render(<StreamApp services={this.services} composeRequests={this.composeRequests} />);
  }

  async onClose(): Promise<void> {
    this.services.audioRecorder.dispose();
    this.root?.unmount();
    this.root = null;
  }
}
