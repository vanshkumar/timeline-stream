export class ImagePicker {
  pick(camera: boolean): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = !camera;
      input.className = "personal-stream-hidden-input";
      if (camera) input.setAttribute("capture", "environment");

      let settled = false;
      const finish = (files: File[]) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(files);
      };
      input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
      input.addEventListener("cancel", () => finish([]), { once: true });
      document.body.append(input);
      input.click();
    });
  }
}
