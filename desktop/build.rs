use std::fs;
use std::path::Path;

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
    let web = Path::new("../web");
    let out = Path::new("assets/app");
    copy_dir(web, out);
    println!("cargo:rerun-if-changed=../web");
}