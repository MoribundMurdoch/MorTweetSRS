//! HTTP-ish API over the `mortweet://` custom protocol for the embedded web UI.

use dioxus::desktop::wry::http::{Method, Request, Response, StatusCode};
use serde::Deserialize;
use serde_json::json;

use crate::deck_folder;

fn json_response(status: StatusCode, value: &impl serde::Serialize) -> Response<Vec<u8>> {
    let body = serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec());
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap_or_else(|_| text_response(StatusCode::INTERNAL_SERVER_ERROR, "error"))
}

fn text_response(status: StatusCode, body: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .body(body.as_bytes().to_vec())
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap()
        })
}

fn cors_preflight() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .body(Vec::new())
        .unwrap_or_else(|_| text_response(StatusCode::INTERNAL_SERVER_ERROR, "error"))
}

fn api_path(uri: &dioxus::desktop::wry::http::Uri) -> String {
    uri.path().trim_start_matches('/').to_string()
}

pub fn is_api_request(request: &Request<Vec<u8>>) -> bool {
    let path = api_path(request.uri());
    path == "api" || path.starts_with("api/")
}

/// Handle an API request. Folder picker may block the calling thread.
pub fn handle(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() == Method::OPTIONS {
        return cors_preflight();
    }

    let path = api_path(request.uri());
    let method = request.method().clone();

    match (method.as_str(), path.as_str()) {
        ("GET", "api/capabilities") => json_response(
            StatusCode::OK,
            &json!({
                "desktop": true,
                "localLibrary": true,
            }),
        ),

        ("GET", "api/local-library") => {
            json_response(StatusCode::OK, &deck_folder::list_library())
        }

        ("POST", "api/local-library/pick") => {
            // Native folder dialog — blocking is fine on the async protocol worker.
            json_response(StatusCode::OK, &deck_folder::pick_folder())
        }

        ("POST", "api/local-library/clear") => match deck_folder::clear_folder() {
            Ok(state) => json_response(StatusCode::OK, &state),
            Err(e) => json_response(StatusCode::INTERNAL_SERVER_ERROR, &json!({ "error": e })),
        },

        ("GET", "api/local-library/read") => {
            let file = request
                .uri()
                .query()
                .and_then(|q| {
                    q.split('&').find_map(|pair| {
                        let mut it = pair.splitn(2, '=');
                        let k = it.next()?;
                        let v = it.next().unwrap_or("");
                        if k == "file" {
                            Some(urlencoding_decode(v))
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or_default();

            match deck_folder::read_deck_file(&file) {
                Ok(text) => Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-store")
                    .body(text.into_bytes())
                    .unwrap_or_else(|_| text_response(StatusCode::INTERNAL_SERVER_ERROR, "error")),
                Err(e) => json_response(StatusCode::BAD_REQUEST, &json!({ "error": e })),
            }
        }

        ("POST", "api/local-library/write") => {
            #[derive(Deserialize)]
            struct WriteBody {
                file: String,
                json: String,
            }
            let body = match serde_json::from_slice::<WriteBody>(request.body()) {
                Ok(b) => b,
                Err(_) => {
                    return json_response(
                        StatusCode::BAD_REQUEST,
                        &json!({ "error": "Expected { file, json }." }),
                    );
                }
            };
            match deck_folder::write_deck_file(&body.file, &body.json) {
                Ok(entry) => json_response(StatusCode::OK, &entry),
                Err(e) => json_response(StatusCode::BAD_REQUEST, &json!({ "error": e })),
            }
        }

        ("POST", "api/local-library/suggest-name") => {
            #[derive(Deserialize)]
            struct NameBody {
                name: Option<String>,
            }
            let name = serde_json::from_slice::<NameBody>(request.body())
                .ok()
                .and_then(|b| b.name)
                .unwrap_or_default();
            json_response(
                StatusCode::OK,
                &json!({ "file": deck_folder::suggest_filename(&name) }),
            )
        }

        _ => json_response(
            StatusCode::NOT_FOUND,
            &json!({ "error": format!("Unknown API route: {path}") }),
        ),
    }
}

/// Minimal query decode (`%20` / `+`).
fn urlencoding_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &s[i + 1..i + 3];
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v as char);
                    i += 3;
                } else {
                    out.push('%');
                    i += 1;
                }
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}
