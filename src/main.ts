import { Notice, Plugin, type Editor, type TFile } from "obsidian";
import { AudioRecorderService } from "./capture/audio-recorder";
import { CaptureCoordinator } from "./capture/capture-coordinator";
import { ImagePicker } from "./capture/image-picker";
import { registerBuiltins } from "./commands/builtins";
import { buildQuoteSelectionMarkdown } from "./commands/quote-selection";
import { SlashCommandRegistry } from "./commands/slash-registry";
import { SearchService } from "./index/search-service";
import { StreamIndex } from "./index/stream-index";
import { AttachmentStore } from "./storage/attachment-store";
import { DraftStore } from "./storage/draft-store";
import { EntryCodec } from "./storage/entry-codec";
import { RecoveryService } from "./storage/recovery-service";
import { StreamRepository } from "./storage/stream-repository";
import { STREAM_VIEW_TYPE, StreamView } from "./view/StreamView";
import type { StreamServices } from "./view/types";

export default class PersonalStreamPlugin extends Plugin {
  private services!: StreamServices;
  private layoutReady = false;
  private pendingOpen = false;
  private openingStream: Promise<StreamView> | null = null;

  async onload(): Promise<void> {
    const codec = new EntryCodec();
    const attachments = new AttachmentStore(this.app);
    const repository = new StreamRepository(this.app, codec, attachments);
    const drafts = new DraftStore(this.app.vault.getName());
    const index = new StreamIndex(this.app.vault, this.app.metadataCache, codec);
    const search = new SearchService(repository);
    const commands = registerBuiltins(new SlashCommandRegistry());
    const audioRecorder = new AudioRecorderService();

    this.services = {
      app: this.app,
      repository,
      attachments,
      drafts,
      capture: new CaptureCoordinator(repository, attachments, drafts),
      index,
      search,
      commands,
      imagePicker: new ImagePicker(),
      audioRecorder,
      recovery: new RecoveryService(this.app.vault, this.app.metadataCache)
    };

    this.registerView(STREAM_VIEW_TYPE, (leaf) => new StreamView(leaf, this.services));
    this.addCommand({
      id: "open-personal-stream",
      name: "Open personal stream",
      icon: "message-square",
      callback: () => void this.openStream()
    });
    this.addCommand({
      id: "quote-selection-to-personal-stream",
      name: "Quote selection to personal stream",
      editorCallback: (editor, context) => void this.quoteSelectionToStream(editor, context.file)
    });
    this.addRibbonIcon("message-square", "Open personal stream", () => void this.openStream());
    this.registerObsidianProtocolHandler("personal-stream", (parameters) => {
      if (parameters.vault && parameters.vault !== this.app.vault.getName()) {
        new Notice(`Personal Stream is installed in ${this.app.vault.getName()}, not ${parameters.vault}.`);
        return;
      }
      if (!this.layoutReady) {
        this.pendingOpen = true;
        return;
      }
      void this.openStream();
    });

    this.app.workspace.onLayoutReady(() => {
      this.layoutReady = true;
      index.start(this);
      void index.rebuild().then(() => {
        if (this.pendingOpen) {
          this.pendingOpen = false;
          void this.openStream();
        }
      });
    });
  }

  onunload(): void {
    this.services?.audioRecorder.dispose();
    this.app.workspace.detachLeavesOfType(STREAM_VIEW_TYPE);
  }

  private async quoteSelectionToStream(editor: Editor, file: TFile | null): Promise<void> {
    if (!file || file.extension.toLowerCase() !== "md") {
      new Notice("Open a Markdown note before quoting to Personal Stream.");
      return;
    }

    try {
      const markdown = buildQuoteSelectionMarkdown(editor.getSelection(), file.path);
      const view = await this.openStream();
      view.requestCompose(markdown);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      new Notice(`Could not quote to Personal Stream: ${message}`);
    }
  }

  private async openStream(): Promise<StreamView> {
    if (this.openingStream) return this.openingStream;
    const opening = this.revealStream();
    this.openingStream = opening;
    try {
      return await opening;
    } finally {
      if (this.openingStream === opening) this.openingStream = null;
    }
  }

  private async revealStream(): Promise<StreamView> {
    let leaf = this.app.workspace.getLeavesOfType(STREAM_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: STREAM_VIEW_TYPE, active: true });
    }
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof StreamView)) {
      throw new Error("The Personal Stream view could not be opened.");
    }
    return leaf.view;
  }
}
