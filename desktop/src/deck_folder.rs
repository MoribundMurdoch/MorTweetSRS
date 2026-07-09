//! Local deck folder: remembered path + safe read/write of `*.json` decks.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

const PREFS_DIR: &str = "mor-tweet-srs";
const PREFS_FILE: &str = "prefs.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub deck_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDeckEntry {
    pub file: String,
    pub name: String,
    pub posts: usize,
    pub mtime: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibraryState {
    pub folder: Option<String>,
    pub decks: Vec<LocalDeckEntry>,
    pub error: Option<String>,
}

static PREFS_LOCK: Mutex<()> = Mutex::new(());

fn prefs_path() -> Option<PathBuf> {
    let base = dirs::config_dir()?;
    Some(base.join(PREFS_DIR).join(PREFS_FILE))
}

pub fn load_prefs() -> Prefs {
    let _g = PREFS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let Some(path) = prefs_path() else {
        return Prefs::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return Prefs::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_prefs(prefs: &Prefs) -> Result<(), String> {
    let _g = PREFS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = prefs_path().ok_or_else(|| "Could not resolve config directory.".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Could not create config dir: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not save prefs: {e}"))
}

/// Only plain `name.json` basenames — no paths, no traversal.
pub fn safe_deck_filename(name: &str) -> Option<String> {
    let name = name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    let path = Path::new(name);
    if path.components().count() != 1 {
        return None;
    }
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".json") {
        return None;
    }
    // Reject hidden / weird names
    if name.starts_with('.') {
        return None;
    }
    Some(name.to_string())
}

fn folder_from_prefs() -> Result<PathBuf, String> {
    let prefs = load_prefs();
    let Some(folder) = prefs.deck_folder.filter(|s| !s.trim().is_empty()) else {
        return Err("No deck folder set.".into());
    };
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err(format!("Deck folder is missing or not a directory: {folder}"));
    }
    Ok(path)
}

fn resolve_in_folder(folder: &Path, file: &str) -> Result<PathBuf, String> {
    let safe = safe_deck_filename(file).ok_or_else(|| "Invalid deck file name.".to_string())?;
    let folder_canon = folder
        .canonicalize()
        .map_err(|e| format!("Could not open deck folder: {e}"))?;
    let full = folder_canon.join(&safe);
    // Basename-only join cannot escape; still reject if something odd reappears.
    if full.file_name().and_then(|n| n.to_str()) != Some(safe.as_str()) {
        return Err("Deck path escapes the library folder.".into());
    }
    Ok(full)
}

fn deck_meta_from_json(file: &str, text: &str, mtime: Option<u64>) -> LocalDeckEntry {
    let (name, posts) = match serde_json::from_str::<serde_json::Value>(text) {
        Ok(v) => {
            let name = v
                .get("name")
                .and_then(|n| n.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| file.trim_end_matches(".json").to_string());
            let posts = v
                .get("posts")
                .and_then(|p| p.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            (name, posts)
        }
        Err(_) => (file.trim_end_matches(".json").to_string(), 0),
    };
    LocalDeckEntry {
        file: file.to_string(),
        name,
        posts,
        mtime,
    }
}

fn file_mtime(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

pub fn list_library() -> LocalLibraryState {
    let prefs = load_prefs();
    let Some(folder_str) = prefs.deck_folder.clone().filter(|s| !s.trim().is_empty()) else {
        return LocalLibraryState {
            folder: None,
            decks: vec![],
            error: None,
        };
    };

    let folder = PathBuf::from(&folder_str);
    if !folder.is_dir() {
        return LocalLibraryState {
            folder: Some(folder_str),
            decks: vec![],
            error: Some("Folder not found. Choose a deck folder again.".into()),
        };
    }

    let mut decks = Vec::new();
    let entries = match fs::read_dir(&folder) {
        Ok(e) => e,
        Err(e) => {
            return LocalLibraryState {
                folder: Some(folder_str),
                decks: vec![],
                error: Some(format!("Could not read folder: {e}")),
            };
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if safe_deck_filename(name).is_none() {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        // Skip non-deck JSON quietly
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            if !v.get("posts").map(|p| p.is_array()).unwrap_or(false) {
                continue;
            }
        } else {
            continue;
        }
        decks.push(deck_meta_from_json(name, &text, file_mtime(&path)));
    }

    decks.sort_by(|a, b| {
        b.mtime
            .cmp(&a.mtime)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    LocalLibraryState {
        folder: Some(folder_str),
        decks,
        error: None,
    }
}

pub fn pick_folder() -> LocalLibraryState {
    let start = load_prefs()
        .deck_folder
        .as_ref()
        .map(PathBuf::from)
        .filter(|p| p.is_dir());

    let mut dialog = rfd::FileDialog::new().set_title("Choose folder for your study decks");
    if let Some(dir) = start {
        dialog = dialog.set_directory(dir);
    }

    let Some(path) = dialog.pick_folder() else {
        // Cancel — return current state without error
        return list_library();
    };

    let folder = path.to_string_lossy().to_string();
    if let Err(e) = save_prefs(&Prefs {
        deck_folder: Some(folder.clone()),
    }) {
        return LocalLibraryState {
            folder: Some(folder),
            decks: vec![],
            error: Some(e),
        };
    }
    list_library()
}

pub fn clear_folder() -> Result<LocalLibraryState, String> {
    save_prefs(&Prefs { deck_folder: None })?;
    Ok(list_library())
}

pub fn read_deck_file(file: &str) -> Result<String, String> {
    let folder = folder_from_prefs()?;
    let path = resolve_in_folder(&folder, file)?;
    fs::read_to_string(&path).map_err(|e| format!("Could not read deck: {e}"))
}

/// Write JSON text into the library folder. `file` must be a safe basename.
pub fn write_deck_file(file: &str, json: &str) -> Result<LocalDeckEntry, String> {
    // Validate JSON is a deck-shaped object before writing
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "Not valid JSON.".to_string())?;
    if !value.is_object() || !value.get("posts").map(|p| p.is_array()).unwrap_or(false) {
        return Err("Not a valid deck file (needs a posts array).".into());
    }

    let folder = folder_from_prefs()?;
    let path = resolve_in_folder(&folder, file)?;
    fs::write(&path, json).map_err(|e| format!("Could not write deck: {e}"))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(file);
    Ok(deck_meta_from_json(name, json, file_mtime(&path)))
}

/// Suggest a filename from a deck display name.
pub fn suggest_filename(deck_name: &str) -> String {
    let mut slug: String = deck_name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let base = if slug.is_empty() { "deck" } else { slug };
    format!("{base}.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_names() {
        assert_eq!(safe_deck_filename("my-deck.json").as_deref(), Some("my-deck.json"));
        assert!(safe_deck_filename("../x.json").is_none());
        assert!(safe_deck_filename("a/b.json").is_none());
        assert!(safe_deck_filename("nope.txt").is_none());
        assert!(safe_deck_filename(".hidden.json").is_none());
    }

    #[test]
    fn suggest() {
        assert_eq!(suggest_filename("My Cool Deck"), "my-cool-deck.json");
        assert_eq!(suggest_filename("   "), "deck.json");
    }
}
