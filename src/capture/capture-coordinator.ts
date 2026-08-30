import type { CommitRequest, DraftState, ParsedEntry } from "../domain/entry";
import type { AttachmentVerifier } from "../storage/attachment-store";
import type { DraftPersistence } from "../storage/draft-store";
import type { EntryCommitter } from "../storage/stream-repository";

export class CaptureCoordinator {
  private inFlight: Promise<ParsedEntry> | null = null;

  constructor(
    private readonly repository: EntryCommitter,
    private readonly attachments: AttachmentVerifier,
    private readonly drafts: DraftPersistence
  ) {}

  submit(request: CommitRequest): Promise<ParsedEntry> {
    if (this.inFlight) {
      return Promise.reject(new Error("A stream entry is already being sent."));
    }
    if (!request.body.trim() && request.attachments.length === 0) {
      return Promise.reject(new Error("Write something or attach media before sending."));
    }

    this.inFlight = this.commit(request).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async commit(request: CommitRequest): Promise<ParsedEntry> {
    const pending: DraftState = {
      identity: request.identity,
      body: request.body,
      tags: request.tags,
      attachments: request.attachments,
      phase: "committing",
      updatedAt: Date.now()
    };
    this.drafts.save(pending);

    try {
      await this.attachments.verifyAll(request.attachments);
      const entry = await this.repository.commit(request);
      this.drafts.clear();
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.drafts.save({ ...pending, phase: "error", error: message, updatedAt: Date.now() });
      throw error;
    }
  }
}
