mod commands;
mod crypto;
mod demo;
mod error;
mod exports;
mod models;
mod prefs;
mod state;
mod storage;

pub use demo::write_demo_vault;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_snapshot,
            commands::create_vault,
            commands::unlock_vault,
            commands::lock_vault,
            commands::set_vault_settings,
            commands::upsert_entry,
            commands::delete_entry,
            commands::mark_entry_rotated,
            commands::reveal_secret,
            commands::copy_secret,
            commands::preview_export,
            commands::copy_export,
            commands::export_encrypted_backup
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let app_state = window.state::<state::AppState>();
                app_state.lock();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
