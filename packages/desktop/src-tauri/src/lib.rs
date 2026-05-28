// src-tauri/src/lib.rs

//! Sidecoin Desktop — Tauri backend
//!
//! eCash Bitcoin hard fork wallet with BIP-300/301 Drivechain support.
//! https://ecash.com

use tauri_specta::{collect_commands, Builder};

pub mod commands;

pub use commands::{
    BlockInfo, Sidechain, WalletBalance,
    get_balance, get_latest_block, get_sidechains, get_receive_address, health_check,
};

// ---------------------------------------------------------------------------
// Specta builder (shared between lib and export_types)
// ---------------------------------------------------------------------------

/// Build the specta/tauri-specta builder with all registered commands.
pub fn create_specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        get_balance,
        get_latest_block,
        get_sidechains,
        get_receive_address,
        health_check,
    ])
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

pub fn run() {
    let builder = create_specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    let invoke_handler = builder.invoke_handler();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(invoke_handler)
        .setup(|_app| {
            tracing::info!("Sidecoin Desktop starting — https://ecash.com");
            tracing::info!("eCash hard fork target: 2026-08-21 15:00Z (block ~964,000)");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sidecoin Desktop");
}
