//! Binary that exports TypeScript type bindings via specta.
//! Invoked by `pnpm type:gen` / `cargo run --bin export_types`.

fn main() {
    let builder = sidecoin_desktop::create_specta_builder();

    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    println!("TypeScript bindings exported to ../src/bindings.ts");
}
