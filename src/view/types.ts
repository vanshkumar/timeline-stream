import type { App } from "obsidian";
import type { AudioRecorderService } from "../capture/audio-recorder";
import type { CaptureCoordinator } from "../capture/capture-coordinator";
import type { ImagePicker } from "../capture/image-picker";
import type { SlashCommandRegistry } from "../commands/slash-registry";
import type { SearchService } from "../index/search-service";
import type { StreamIndex } from "../index/stream-index";
import type { AttachmentStore } from "../storage/attachment-store";
import type { DraftStore } from "../storage/draft-store";
import type { RecoveryService } from "../storage/recovery-service";
import type { StreamRepository } from "../storage/stream-repository";

export interface StreamServices {
  app: App;
  repository: StreamRepository;
  attachments: AttachmentStore;
  drafts: DraftStore;
  capture: CaptureCoordinator;
  index: StreamIndex;
  search: SearchService;
  commands: SlashCommandRegistry;
  imagePicker: ImagePicker;
  audioRecorder: AudioRecorderService;
  recovery: RecoveryService;
}
