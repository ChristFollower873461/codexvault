use std::path::Path;

fn main() {
    let mut args = std::env::args().skip(1);
    let output_path = args.next().unwrap_or_else(|| "codexvault-demo.cvault".into());
    let password = args.next().unwrap_or_else(|| "codexvault-demo".into());

    if output_path == "--help" || output_path == "-h" {
        eprintln!("Usage: demo_vault [output-path] [password]");
        std::process::exit(0);
    }

    match codexvault_lib::write_demo_vault(Path::new(&output_path), &password) {
        Ok(path) => {
            println!("Wrote demo vault to {}", path.display());
            println!("Password: {password}");
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
