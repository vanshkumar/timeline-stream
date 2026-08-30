import { App, Modal, Setting } from "obsidian";

class ConfirmDeleteModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly label: string,
    private readonly resolveResult: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Move entry to trash?");
    this.contentEl.createEl("p", {
      text: `${this.label} will be moved using your Obsidian trash preference. Its attachments will be retained.`
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
        })
      )
      .addButton((button) =>
        button
          .setButtonText("Move to trash")
          .setWarning()
          .onClick(() => {
            this.finish(true);
          })
      );
  }

  onClose(): void {
    if (!this.resolved) this.resolveResult(false);
    this.contentEl.empty();
  }

  private finish(value: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(value);
    this.close();
  }
}

export function confirmDelete(app: App, label: string): Promise<boolean> {
  return new Promise((resolve) => new ConfirmDeleteModal(app, label, resolve).open());
}
