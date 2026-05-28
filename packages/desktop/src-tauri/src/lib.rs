//! Sidecoin Desktop — Tauri backend
//!
//! eCash Bitcoin hard fork wallet with BIP-300/301 Drivechain support.
//! https://ecash.com

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::{collect_commands, Builder};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Wallet balance returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WalletBalance {
    /// Confirmed balance in satoshis.
    pub confirmed: u64,
    /// Unconfirmed (mempool) balance in satoshis.
    pub unconfirmed: u64,
    /// Total = confirmed + unconfirmed.
    pub total: u64,
}

/// Minimal block info for the dashboard header.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BlockInfo {
    pub height: u64,
    pub hash: String,
    pub timestamp: i64,
}

/// A sidechain known to the wallet.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Sidechain {
    pub slot: u8,
    pub name: String,
    pub description: String,
    pub active: bool,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Return the current wallet balance.
#[tauri::command]
#[specta::specta]
pub async fn get_balance() -> Result<WalletBalance, String> {
    // TODO: query electrum / node RPC
    Ok(WalletBalance {
        confirmed: 0,
        unconfirmed: 0,
        total: 0,
    })
}

/// Return info about the latest known block.
#[tauri::command]
#[specta::specta]
pub async fn get_latest_block() -> Result<BlockInfo, String> {
    // TODO: query node RPC
    Ok(BlockInfo {
        height: 0,
        hash: String::from("0000000000000000000000000000000000000000000000000000000000000000"),
        timestamp: 0,
    })
}

/// Return the list of known sidechains (BIP-300).
#[tauri::command]
#[specta::specta]
pub async fn get_sidechains() -> Result<Vec<Sidechain>, String> {
    // TODO: query drivechain state
    let sidechains = vec![
        Sidechain { slot: 0, name: "Thunder".into(),    description: "Payment channel network".into(),   active: false },
        Sidechain { slot: 1, name: "zSide".into(),      description: "Privacy sidechain (zk)".into(),    active: false },
        Sidechain { slot: 2, name: "BitNames".into(),    description: "Decentralized identity".into(),    active: false },
        Sidechain { slot: 3, name: "BitAssets".into(),   description: "Tokenized assets".into(),          active: false },
        Sidechain { slot: 4, name: "Photon".into(),      description: "Smart contracts".into(),           active: false },
        Sidechain { slot: 5, name: "Truthcoin".into(),   description: "Prediction markets".into(),        active: false },
        Sidechain { slot: 6, name: "CoinShift".into(),   description: "Cross-chain bridge".into(),        active: false },
    ];
    Ok(sidechains)
}

/// Generate a new receive address.
#[tauri::command]
#[specta::specta]
pub async fn get_receive_address() -> Result<String, String> {
    // TODO: derive from HD wallet
    Ok(String::from("ecash1q_placeholder_address"))
}

/// Application health check — used by Sentry and frontend readiness probes.
#[tauri::command]
#[specta::specta]
pub async fn health_check() -> Result<String, String> {
    Ok(String::from("ok"))
}

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
