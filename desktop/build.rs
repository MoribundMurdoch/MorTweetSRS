use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn copy_dir(src: &Path, dst: &Path) {
    if dst.exists() {
        fs::remove_dir_all(dst).expect("failed to clear asset dir");
    }
    fs::create_dir_all(dst).expect("failed to create asset dir");

    for entry in walkdir::WalkDir::new(src) {
        let entry = entry.expect("walkdir");
        let rel = entry.path().strip_prefix(src).expect("strip prefix");
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).expect("mkdir");
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("mkdir parent");
            }
            fs::copy(entry.path(), &target).expect("copy");
        }
    }
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let web = manifest_dir.join("../web");
    let app_assets = manifest_dir.join("assets/app");

    copy_dir(&web, &app_assets);
    println!("cargo:rerun-if-changed={}", web.display());
}