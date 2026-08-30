import { Notice, Plugin } from "obsidian";
import { AudioRecorderService } from "./capture/audio-recorder";
import { CaptureCoordinator } from "./capture/capture-coordinator";
import { ImagePicker } from "./capture/image-picker";
import { registerBuiltins } from "./commands/builtins";
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

  async onload(): Promise<void> {
    const codec = new EntryCodec();
    const repository = new StreamRepository(this.app, codec);
    const attachments = new AttachmentStore(this.app);
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
      recovery: new RecoveryService(this.app.vault)
    };

    this.registerView(STREAM_VIEW_TYPE, (leaf) => new StreamView(leaf, this.services));
    this.addCommand({
      id: "open-personal-stream",
      name: "Open personal stream",
      icon: "message-square",
      callback: () => void this.openStream()
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

  private async openStream(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(STREAM_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: STREAM_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof StreamView) leaf.view.focusComposer();
  }
}
