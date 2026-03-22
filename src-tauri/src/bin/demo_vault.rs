use std::{env, path::Path, process};

fn main() {
    let mut args = env::args().skip(1);
    let output_path = args
        .next()
        .unwrap_or_else(|| "codexvault-demo.cvault".into());
    let password = args.next().unwrap_or_else(|| "codexvault-demo".into());

    if args.next().is_some() {
        eprintln!("Usage: demo_vault [output-path] [password]");
        process::exit(1);
    }

    match codexvault_lib::write_demo_vault(Path::new(&output_path), &password) {
        Ok(written_path) => {
            println!("Wrote demo vault to {}", written_path.display());
            println!("Password: {password}");
            println!("The vault contains fake credentials for screenshots, QA, and demos only.");
        }
        Err(message) => {
            eprintln!("{message}");
            process::exit(1);
        }
    }
}
