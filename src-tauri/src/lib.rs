use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Emitter, Manager, State};

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "jfif", "png", "gif", "bmp", "webp", "tif", "tiff", "ico",
];

/// The images in the opened file's folder, and which one to show first.
#[derive(Clone, Serialize)]
struct ImageSet {
    files: Vec<String>,
    index: usize,
}

/// Image set from the command line, read once by the frontend at startup.
struct Initial(Mutex<Option<ImageSet>>);

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Builds the list of sibling images (sorted by name) for the given file.
fn image_set_for(file: &Path) -> Option<ImageSet> {
    let file = std::fs::canonicalize(file).ok()?;
    let dir = file.parent()?;
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && is_image(p))
        .collect();
    files.sort_by_key(|p| {
        p.file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    });
    let index = files.iter().position(|p| *p == file).unwrap_or(0);
    let files = files
        .into_iter()
        .map(|p| {
            // canonicalize adds the \\?\ prefix on Windows; strip it for the webview.
            let s = p.to_string_lossy().into_owned();
            s.strip_prefix(r"\\?\").map(str::to_owned).unwrap_or(s)
        })
        .collect();
    Some(ImageSet { files, index })
}

/// Finds the first argument that is an existing image file.
fn image_set_from_args(args: &[String], cwd: &Path) -> Option<ImageSet> {
    args.iter().skip(1).find_map(|a| {
        let p = Path::new(a);
        let p = if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) };
        (p.is_file() && is_image(&p)).then(|| image_set_for(&p)).flatten()
    })
}

#[tauri::command]
fn take_initial(initial: State<Initial>) -> Option<ImageSet> {
    initial.0.lock().unwrap().take()
}

#[tauri::command]
fn move_to_recycle_bin(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() || !is_image(p) {
        return Err("not an image file".into());
    }
    trash::delete(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_default_apps() {
    // Opens Windows Settings > Default apps on Lumen Viewer's page.
    let _ = std::process::Command::new("explorer")
        .arg("ms-settings:defaultapps?registeredAppUser=Lumen%20Viewer")
        .spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let initial = image_set_from_args(&args, &cwd);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // A second launch (e.g. another "Open with") reuses this window.
            if let Some(set) = image_set_from_args(&argv, Path::new(&cwd)) {
                let _ = app.emit("open-images", set);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .manage(Initial(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![take_initial, move_to_recycle_bin, open_default_apps])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
