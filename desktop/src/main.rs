use dioxus::desktop::tao::window::Icon;
use dioxus::desktop::{Config, LogicalSize, WindowBuilder};
use dioxus::prelude::*;

fn load_app_icon() -> Option<Icon> {
    let bytes = include_bytes!("../assets/icon.png");
    let img = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = img.dimensions();
    Icon::from_rgba(img.into_raw(), width, height).ok()
}

#[component]
fn App() -> Element {
    rsx! {
        iframe {
            src: "/app/index.html",
            title: "MorTweet SRS",
            style: "position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;",
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
        .with_background_color((18, 20, 26, 255));

    LaunchBuilder::new().with_cfg(cfg).launch(App);
}