// src-tauri/src/commands.rs

//! Tauri commands for the Sidecoin desktop wallet.

use serde::{Deserialize, Serialize};
use specta::Type;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Wallet balance returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WalletBalance {
    /// Confirmed balance in satoshis.
    pub confirmed: f64,
    /// Unconfirmed (mempool) balance in satoshis.
    pub unconfirmed: f64,
    /// Total = confirmed + unconfirmed.
    pub total: f64,
}

/// Minimal block info for the dashboard header.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BlockInfo {
    pub height: u32,
    pub hash: String,
    pub timestamp: i32,
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
        confirmed: 0.0,
        unconfirmed: 0.0,
        total: 0.0,
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
