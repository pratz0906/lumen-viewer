# Lumen Viewer

A fast photo viewer for Windows. Opening an image shows it over a dimmed, see-through background that covers the screen.

Built with [Tauri 2](https://tauri.app) (Rust + TypeScript).

## Download

Get the installer (`Lumen Viewer_x.y.z_x64-setup.exe`) from the [Releases](../../releases) page. During setup you can:

- install for just yourself or for all users,
- choose the install folder,
- make Lumen Viewer your default image viewer.

After installing, Lumen Viewer also appears under **right-click → Open with** for jpg, jpeg, jfif, png, gif, bmp, webp, tif, tiff and ico files. TIFF files aren't displayed yet.

## Controls

| Action | Keys / mouse |
| --- | --- |
| Zoom in / out | Mouse wheel, `↑` / `↓`, `+` / `-` |
| Fit to screen / actual size | `0` / `1`, or double-click |
| Pan | Drag the image |
| Previous / next image in folder | `←` / `→`, PageUp / PageDown |
| First / last image | Home / End |
| Rotate | `L` / `R` |
| Move to Recycle Bin | Delete (Shift+Delete always asks) |
| Full screen / window | F11 or the maximize button |
| Close | Esc or ✕ |

## Building from source

Requirements: Rust, Node.js, and the Visual Studio C++ Build Tools.

```sh
npm install
npm run tauri dev -- -- "C:\path\to\photo.jpg"   # run in development
npm run release                                  # build the installer
```

`npm run release` runs `tauri build` with your home folder path stripped from the executable, so a shared build doesn't reveal your username.

The installer is written to `src-tauri/target/release/bundle/nsis/`.
