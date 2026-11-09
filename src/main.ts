import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ImageSet {
  files: string[];
  index: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 32;
const ZOOM_STEP = 1.25;
const BAR_HIDE_MS = 1800;

const win = getCurrentWindow();
const stage = document.getElementById("stage")!;
const photo = document.getElementById("photo") as HTMLImageElement;
const bar = document.getElementById("bar")!;
const zoomLabel = document.getElementById("zoom-label")!;
const counter = document.getElementById("counter")!;
const message = document.getElementById("message")!;
const messageText = document.getElementById("message-text")!;
const titleEl = document.getElementById("title")!;

let files: string[] = [];
let index = 0;

// View state: offset of the image centre from the screen centre, scale and rotation.
let tx = 0;
let ty = 0;
let scale = 1;
let rotation = 0;
let fitted = true;

let shown = false;
const preloaded = new Map<string, HTMLImageElement>();

// ---- view ----------------------------------------------------------------

function naturalSize(): { w: number; h: number } {
  const w = photo.naturalWidth || 1;
  const h = photo.naturalHeight || 1;
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

function fitScale(): number {
  const { w, h } = naturalSize();
  // Leave a small margin so the photo never touches the screen edges.
  return Math.min(1, (window.innerWidth * 0.94) / w, (window.innerHeight * 0.94) / h);
}

function render(animate = false): void {
  photo.classList.toggle("animate", animate);
  photo.classList.toggle("pixelated", scale >= 4);
  photo.style.transform =
    `translate(-50%, -50%) translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale})`;
  zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function fit(animate = false): void {
  scale = fitScale();
  tx = 0;
  ty = 0;
  fitted = true;
  render(animate);
}

function actualSize(animate = false): void {
  scale = 1;
  tx = 0;
  ty = 0;
  fitted = false;
  render(animate);
}

/** Zooms by `factor`, keeping the screen point (px, py) fixed under the cursor. */
function zoomAt(factor: number, px: number, py: number, animate = false): void {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
  const k = next / scale;
  const cx = px - window.innerWidth / 2;
  const cy = py - window.innerHeight / 2;
  tx = cx - (cx - tx) * k;
  ty = cy - (cy - ty) * k;
  scale = next;
  fitted = false;
  render(animate);
}

function zoomCentre(factor: number): void {
  zoomAt(factor, window.innerWidth / 2, window.innerHeight / 2, true);
}

function rotate(delta: number): void {
  rotation = (rotation + delta + 360) % 360;
  if (fitted) fit(true);
  else render(true);
}

// ---- images --------------------------------------------------------------

function preload(i: number): void {
  if (i < 0 || i >= files.length || preloaded.has(files[i])) return;
  const img = new Image();
  img.src = convertFileSrc(files[i]);
  preloaded.set(files[i], img);
}

function show(i: number): void {
  if (files.length === 0) return;
  index = (i + files.length) % files.length;
  rotation = 0;
  photo.classList.remove("loaded");
  photo.src = convertFileSrc(files[index]);
  counter.textContent = files.length > 1 ? `${index + 1} / ${files.length}` : "";
  const name = files[index].split(/[\\/]/).pop();
  titleEl.textContent = `${name} - Lumen Viewer`;
  void win.setTitle(titleEl.textContent);

  // Keep only the neighbours cached.
  const keep = new Set([files[index - 1], files[index], files[index + 1]]);
  for (const key of preloaded.keys()) if (!keep.has(key)) preloaded.delete(key);
  preload(index + 1);
  preload(index - 1);
}

function openSet(set: ImageSet): void {
  files = set.files;
  message.hidden = true;
  bar.hidden = false;
  show(set.index);
}

photo.addEventListener("load", () => {
  fit();
  photo.classList.add("loaded");
  revealWindow();
});

photo.addEventListener("error", () => {
  const name = files[index]?.split(/[\\/]/).pop() ?? "This file";
  showMessage(`${name} can't be displayed. The format may not be supported.`);
});

function showMessage(text: string): void {
  messageText.textContent = text;
  message.hidden = false;
  revealWindow();
}

async function revealWindow(): Promise<void> {
  if (shown) return;
  shown = true;
  await win.show();
  await win.setFocus();
}

// ---- delete --------------------------------------------------------------

const ASK_KEY = "lumen.askBeforeDelete";
const confirmBox = document.getElementById("confirm")!;
const confirmText = document.getElementById("confirm-text")!;
const confirmRemember = document.getElementById("confirm-remember") as HTMLInputElement;

function askBeforeDelete(): boolean {
  try {
    return localStorage.getItem(ASK_KEY) !== "false";
  } catch {
    return true;
  }
}

function setAskBeforeDelete(ask: boolean): void {
  try {
    localStorage.setItem(ASK_KEY, String(ask));
  } catch {
    // Preference just won't persist.
  }
}

/** Shows the Yes/No prompt; resolves true for Yes. */
function confirmDelete(name: string): Promise<boolean> {
  confirmText.textContent = `Move "${name}" to the Recycle Bin?`;
  confirmRemember.checked = !askBeforeDelete();
  confirmBox.hidden = false;
  const yes = confirmBox.querySelector<HTMLButtonElement>("[data-answer=yes]")!;
  const no = confirmBox.querySelector<HTMLButtonElement>("[data-answer=no]")!;
  yes.focus();

  return new Promise((resolve) => {
    const finish = (answer: boolean) => {
      confirmBox.hidden = true;
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      window.removeEventListener("keydown", onKey, true);
      if (answer) setAskBeforeDelete(!confirmRemember.checked);
      resolve(answer);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "n" || e.key === "N") finish(false);
      else if (e.key === "y" || e.key === "Y") finish(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
    window.addEventListener("keydown", onKey, true);
  });
}

/** Delete key: move the current image to the Recycle Bin. Shift+Delete always asks. */
async function requestDelete(forceAsk: boolean): Promise<void> {
  if (files.length === 0) return;
  const path = files[index];
  const name = path.split(/[\\/]/).pop() ?? path;
  if ((forceAsk || askBeforeDelete()) && !(await confirmDelete(name))) return;

  try {
    await invoke("move_to_recycle_bin", { path });
  } catch (err) {
    showMessage(`Couldn't move ${name} to the Recycle Bin: ${err}`);
    return;
  }
  preloaded.delete(path);
  files.splice(index, 1);
  if (files.length === 0) {
    photo.removeAttribute("src");
    photo.classList.remove("loaded");
    bar.hidden = true;
    titleEl.textContent = "Lumen Viewer";
    showMessage("No more images in this folder.");
  } else {
    show(Math.min(index, files.length - 1));
  }
}

// ---- input ---------------------------------------------------------------

stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; mice give ±100.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    zoomAt(factor, e.clientX, e.clientY);
  },
  { passive: false },
);

let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;

stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (e.target === photo) {
    drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    photo.setPointerCapture(e.pointerId);
    photo.classList.add("dragging");
  }
});

stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  tx = drag.tx + dx;
  ty = drag.ty + dy;
  fitted = false;
  render();
});

stage.addEventListener("pointerup", () => {
  if (drag) {
    photo.classList.remove("dragging");
    drag = null;
  }
});

photo.addEventListener("dblclick", (e) => {
  if (fitted || scale < 1) {
    // Zoom to 100% around the clicked point.
    zoomAt(1 / scale, e.clientX, e.clientY, true);
  } else {
    fit(true);
  }
});

window.addEventListener("keydown", (e) => {
  if (!confirmBox.hidden) return; // the delete prompt handles its own keys
  switch (e.key) {
    case "Escape":
      close();
      break;
    case "ArrowUp":
      zoomCentre(ZOOM_STEP);
      break;
    case "ArrowDown":
      zoomCentre(1 / ZOOM_STEP);
      break;
    case "Delete":
      void requestDelete(e.shiftKey);
      break;
    case "F11":
      void toggleFullscreen();
      break;
    case "ArrowRight":
    case "PageDown":
    case " ":
      show(index + 1);
      break;
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      show(index - 1);
      break;
    case "Home":
      show(0);
      break;
    case "End":
      show(files.length - 1);
      break;
    case "+":
    case "=":
      zoomCentre(ZOOM_STEP);
      break;
    case "-":
    case "_":
      zoomCentre(1 / ZOOM_STEP);
      break;
    case "0":
      fit(true);
      break;
    case "1":
      actualSize(true);
      break;
    case "r":
    case "R":
      rotate(90);
      break;
    case "l":
    case "L":
      rotate(-90);
      break;
    default:
      return;
  }
  e.preventDefault();
});

window.addEventListener("resize", () => {
  if (fitted) fit();
});

// ---- control bar ---------------------------------------------------------

let barTimer: number | undefined;

function pokeBar(): void {
  if (bar.hidden) return;
  bar.classList.add("visible");
  window.clearTimeout(barTimer);
  barTimer = window.setTimeout(() => {
    if (!bar.matches(":hover")) bar.classList.remove("visible");
  }, BAR_HIDE_MS);
}

window.addEventListener("mousemove", pokeBar);
bar.addEventListener("mouseleave", pokeBar);

const actions: Record<string, () => void> = {
  prev: () => show(index - 1),
  next: () => show(index + 1),
  "zoom-in": () => zoomCentre(ZOOM_STEP),
  "zoom-out": () => zoomCentre(1 / ZOOM_STEP),
  fit: () => fit(true),
  actual: () => actualSize(true),
  "rotate-left": () => rotate(-90),
  "rotate-right": () => rotate(90),
  default: () => void invoke("open_default_apps"),
  minimize: () => void win.minimize(),
  "toggle-max": () => void toggleFullscreen(),
  close: () => close(),
};

// ---- window mode ---------------------------------------------------------

const maxButton = document.getElementById("max-button")!;

/** Switches between full screen (whole monitor) and a normal, movable window. */
async function toggleFullscreen(): Promise<void> {
  const full = await win.isFullscreen();
  await win.setFullscreen(!full);
  if (full) await win.center();
  updateWindowMode(!full);
}

function updateWindowMode(full: boolean): void {
  document.body.classList.toggle("windowed", !full);
  // Segoe glyphs: E923 = restore, E922 = maximize.
  maxButton.innerHTML = full ? "&#xE923;" : "&#xE922;";
  maxButton.title = full ? "Restore down (F11)" : "Maximize (F11)";
}

document.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    actions[btn.dataset.action!]?.();
  });
});

function close(): void {
  void win.close();
}

// ---- startup -------------------------------------------------------------

listen<ImageSet>("open-images", (e) => openSet(e.payload));

window.addEventListener("DOMContentLoaded", async () => {
  updateWindowMode(await win.isFullscreen());
  const initial = await invoke<ImageSet | null>("take_initial");
  if (initial && initial.files.length > 0) {
    openSet(initial);
  } else {
    showMessage("Open an image with Lumen Viewer to view it here.");
  }
});
