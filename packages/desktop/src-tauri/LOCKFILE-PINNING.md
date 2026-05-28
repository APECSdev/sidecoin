# Cargo.lock Pinning — Critical Transitive Dependencies

## Why this matters

The `tauri-specta` + `specta` + `tauri` macro combination is version-sensitive.
Both `#[tauri::command]` and `#[specta::specta]` generate internal macros
(`__cmd__`, `__tauri_command_name__`, `__specta__fn__`). When both attributes
are on the same function, both macros try to define the same symbols.

Commands MUST live in submodules (not directly in `lib.rs`) so that the
generated macro symbols stay in the submodule's namespace and the `pub use`
re-exports don't collide at the crate root.

Additionally, `tauri-runtime` and `tauri-runtime-wry` must be compatible
with the pinned `tauri` version. Newer runtime versions add trait methods
that older `tauri` versions don't implement, causing compilation failures.

## Direct pins (Cargo.toml)

All direct dependencies use `=x.y.z` exact pins. No automatic upgrades.

## Transitive pins (Cargo.lock only)

These CANNOT be pinned in Cargo.toml because they are internal dependencies
of `tauri`. They are pinned in Cargo.lock by committing the lockfile to git.

| Crate              | Pinned Version | Reason                                       |
|--------------------|---------------|------------------------------------------------|
| tauri-runtime      | 2.10.0        | Must match tauri 2.10.2 mock_runtime traits    |
| tauri-runtime-wry  | 2.10.0        | Must match tauri-runtime version               |
| tauri-macros       | 2.5.4         | Resolved by tauri =2.10.2                      |
| tauri-codegen      | 2.5.4         | Resolved by tauri =2.10.2                      |
| tauri-utils        | 2.8.2         | Resolved by tauri =2.10.2                      |
| tauri-plugin       | 2.5.3         | Resolved by tauri-plugin-* pins                |

## If the lockfile is lost or regenerated

Run these commands IN THIS EXACT ORDER after generating a fresh Cargo.lock:

    cd packages/desktop/src-tauri
    cargo generate-lockfile
    cargo update -p tauri-runtime-wry --precise 2.10.0
    cargo update -p tauri-runtime --precise 2.10.0
    cargo update -p tauri-macros --precise 2.5.4
    cargo update -p tauri-codegen --precise 2.5.4
    cargo update -p tauri-plugin --precise 2.5.3
    cargo update -p tauri-utils --precise 2.8.2
    cargo check

## CI must use --locked

All CI builds MUST use:

    cargo build --locked
    cargo test --locked

The `--locked` flag refuses to modify Cargo.lock, ensuring deterministic
builds. This is equivalent to `npm ci` or `pnpm install --frozen-lockfile`.

## Code structure requirement

Commands decorated with both `#[tauri::command]` and `#[specta::specta]`
MUST be defined in a submodule (e.g., `src/commands.rs`), NOT directly
in `src/lib.rs`. Both proc macros generate identical internal symbols;
placing them in a submodule prevents namespace collisions at the crate root.

## Upgrading tauri in the future

When upgrading tauri, you must upgrade ALL of these together:

1. `tauri` and `tauri-build` (Cargo.toml)
2. `tauri-specta`, `specta`, `specta-typescript` (Cargo.toml)
3. All `tauri-plugin-*` crates (Cargo.toml)
4. `tauri-runtime` + `tauri-runtime-wry` (Cargo.lock via --precise)
5. `tauri-macros`, `tauri-codegen`, `tauri-utils`, `tauri-plugin`
   (Cargo.lock via --precise)

Test that `#[tauri::command]` + `#[specta::specta]` compile without
"defined multiple times" errors before committing.
