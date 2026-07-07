use std::path::{Component, Path, PathBuf};

use include_dir::{include_dir, Dir, File};
use dioxus::desktop::wry::http::{response::Response, Request, StatusCode};

/// Web UI baked in at compile time from `assets/app/` (copied from `../web/` in build.rs).
static WEB_APP: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/assets/app");

pub fn serve(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let rel = rel_path(request.uri());

    match resolve(&rel) {
        Some(file) => ok(file),
        None => not_found(),
    }
}

/// Map `mortweet://app/<path>` (and legacy `mortweet://<file>`) to a path under `assets/app/`.
fn rel_path(uri: &dioxus::desktop::wry::http::Uri) -> String {
    let path = uri.path().trim_start_matches('/');
    if !path.is_empty() {
        return path.to_string();
    }

    match uri.host() {
        Some(host) if host == "app" => "index.html".to_string(),
        Some(host) => host.to_string(),
        None => "index.html".to_string(),
    }
}

fn resolve(path: &str) -> Option<&'static File<'static>> {
    if path.is_empty() {
        return WEB_APP.get_file("index.html");
    }

    let clean = sanitize(path)?;
    WEB_APP.get_file(clean)
}

fn sanitize(path: &str) -> Option<String> {
    let mut out = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    out.to_str().map(str::to_string)
}

fn ok(file: &'static File<'static>) -> Response<Vec<u8>> {
    let mime = mime_guess::from_path(file.path())
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(file.contents().to_vec())
        .unwrap_or_else(|_| not_found())
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(b"Not Found".to_vec())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dioxus::desktop::wry::http::Uri;

    #[test]
    fn embedded_index_exists() {
        assert!(WEB_APP.get_file("index.html").is_some());
        assert!(WEB_APP.get_file("js/app.js").is_some());
    }

    #[test]
    fn rel_path_parses_app_urls() {
        let index: Uri = "mortweet://app/index.html".parse().unwrap();
        assert_eq!(rel_path(&index), "index.html");

        let css: Uri = "mortweet://app/css/app.css".parse().unwrap();
        assert_eq!(rel_path(&css), "css/app.css");
    }
}