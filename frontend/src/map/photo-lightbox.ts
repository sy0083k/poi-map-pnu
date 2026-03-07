import Viewer from "viewerjs";
import "viewerjs/dist/viewer.css";

export type PhotoLightboxItem = {
  file: File;
  fileName: string;
  relativePath: string;
};

type CreatePhotoLightboxOptions = {
  showToast: (message: string) => void;
};

export function createPhotoLightbox(options: CreatePhotoLightboxOptions): {
  open: (items: PhotoLightboxItem[], startIndex: number) => void;
  destroy: () => void;
} {
  let viewer: Viewer | null = null;
  let container: HTMLDivElement | null = null;
  let objectUrls: string[] = [];

  const cleanup = (): void => {
    if (viewer) {
      viewer.destroy();
      viewer = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  };

  const open = (items: PhotoLightboxItem[], startIndex: number): void => {
    if (items.length === 0) {
      return;
    }
    if (startIndex < 0 || startIndex >= items.length) {
      return;
    }

    cleanup();

    const holder = document.createElement("div");
    holder.style.display = "none";

    const list = document.createElement("ul");
    items.forEach((item) => {
      const objectUrl = URL.createObjectURL(item.file);
      objectUrls.push(objectUrl);
      const li = document.createElement("li");
      const image = document.createElement("img");
      image.src = objectUrl;
      image.alt = item.fileName;
      image.setAttribute("data-caption", `${item.fileName} (${item.relativePath})`);
      li.appendChild(image);
      list.appendChild(li);
    });
    holder.appendChild(list);
    document.body.appendChild(holder);
    container = holder;

    viewer = new Viewer(holder, {
      inline: false,
      navbar: true,
      button: true,
      keyboard: true,
      loop: false,
      movable: true,
      zoomable: true,
      scalable: true,
      transition: true,
      title: (image: HTMLElement) => String(image.getAttribute("data-caption") || image.getAttribute("alt") || ""),
      toolbar: {
        zoomIn: 1,
        zoomOut: 1,
        oneToOne: 1,
        reset: 1,
        prev: 1,
        next: 1
      },
      hidden: () => {
        cleanup();
      }
    });

    try {
      viewer.view(startIndex);
    } catch {
      options.showToast("사진 뷰어를 열지 못했습니다.");
      cleanup();
    }
  };

  return {
    open,
    destroy: cleanup
  };
}
