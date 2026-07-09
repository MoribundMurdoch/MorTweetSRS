mod deck_folder;
mod desktop_api;
mod web_assets;

use dioxus::desktop::tao::window::Icon;
use dioxus::desktop::{Config, LogicalSize, WindowBuilder};
use dioxus::prelude::*;

fn load_app_icon() -> Option<Icon> {
    let bytes = include_bytes!("../assets/icon.png");
    let img = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = img.dimensions();
    Icon::from_rgba(img.into_raw(), width, height).ok()
}

/// Brief splash while the webview navigates to the embedded web app (top-level, not iframe).
#[component]
fn Bootstrap() -> Element {
    use_effect(|| {
        document::eval(r#"window.location.replace("mortweet://app/index.html");"#);
    });

    rsx! {
        div {
            style: "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#12141a;color:#9aa3b2;font-family:sans-serif;",
            "Loading MorTweet SRS…"
        }
    }
}

fn main() {
    dioxus_logger::init(dioxus_logger::tracing::Level::INFO).expect("failed to init logger");

    #[cfg(target_os = "linux")]
    glib::set_prgname(Some("com.moribundmurdoch.mortweet-srs"));

    let mut window = WindowBuilder::new()
        .with_title("MorTweet SRS")
        .with_inner_size(LogicalSize::new(1280.0, 840.0))
        .with_min_inner_size(LogicalSize::new(900.0, 600.0));

    if let Some(icon) = load_app_icon() {
        window = window.with_window_icon(Some(icon));
    }

    let cfg = Config::new()
        .with_menu(None::<dioxus::desktop::muda::Menu>)
        .with_window(window)
        .with_disable_drag_drop_handler(true)
        .with_background_color((18, 20, 26, 255))
        .with_asynchronous_custom_protocol("mortweet", |_id, request, responder| {
            // Folder picker can block; run API off the wry callback when needed.
            if desktop_api::is_api_request(&request) {
                let is_pick = request.uri().path().contains("local-library/pick");
                if is_pick {
                    std::thread::spawn(move || {
                        responder.respond(desktop_api::handle(request));
                    });
                } else {
                    responder.respond(desktop_api::handle(request));
                }
                return;
            }
            responder.respond(web_assets::serve(&request));
        });

    LaunchBuilder::new().with_cfg(cfg).launch(Bootstrap);
}