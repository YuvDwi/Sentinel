use std::process::Command;
use anyhow::{Context, Result};
use tracing::{debug, error};

/// Fetch a secret from 1Password using the CLI
pub fn get_secret(reference: &str) -> Result<String> {
    debug!("Fetching secret from 1Password: {}", reference);
    
    let output = Command::new("op")
        .arg("read")
        .arg(reference)
        .output()
        .context("Failed to execute 1Password CLI. Is it installed? Run: brew install 1password-cli")?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("1Password CLI error: {}", error);
    }

    let secret = String::from_utf8(output.stdout)
        .context("Invalid UTF-8 in secret")?
        .trim()
        .to_string();

    debug!("Successfully fetched secret (length: {} chars)", secret.len());
    Ok(secret)
}

/// Get a field from a 1Password item
pub fn get_item_field(vault: &str, item: &str, field: &str) -> Result<String> {
    let reference = format!("op://{}/{}/{}", vault, item, field);
    get_secret(&reference)
}

/// Verify an API token against 1Password stored token
pub fn verify_api_token(provided_token: &str, vault: &str) -> Result<bool> {
    match get_item_field(vault, "Admin API Token", "token") {
        Ok(valid_token) => Ok(provided_token == valid_token.trim()),
        Err(e) => {
            error!("Failed to verify token against 1Password: {}", e);
            Err(e)
        }
    }
}

/// Verify user credentials against 1Password vault
/// Looks for a Login item with the provided username and checks the password
pub fn verify_user_credentials(vault: &str, username: &str, password: &str) -> Result<bool> {
    debug!("Verifying credentials for user: {}", username);
    
    // Try to get the password for this user from 1Password
    match get_item_field(vault, username, "password") {
        Ok(stored_password) => {
            // Direct comparison for now (in prod you'd use bcrypt)
            Ok(password == stored_password.trim())
        }
        Err(e) => {
            error!("Failed to verify credentials for {}: {}", username, e);
            Err(e)
        }
    }
}

/// Get user role from 1Password
pub fn get_user_role(vault: &str, username: &str) -> Result<String> {
    get_item_field(vault, username, "role")
        .or_else(|_| Ok("viewer".to_string())) // Default role if not found
}

/// Create a new user in 1Password vault
pub fn create_user(vault: &str, username: &str, password: &str, email: &str, role: &str) -> Result<()> {
    debug!("Creating new user in 1Password: {}", username);
    
    // Create a Login item in 1Password with username, password, and role
    let output = Command::new("op")
        .arg("item")
        .arg("create")
        .arg("--category=login")
        .arg(format!("--vault={}", vault))
        .arg(format!("--title={}", username))
        .arg(format!("username={}", username))
        .arg(format!("password={}", password))
        .arg(format!("email={}", email))
        .arg(format!("role[text]={}", role))
        .output()
        .context("Failed to execute 1Password CLI")?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Failed to create user in 1Password: {}", error);
    }

    debug!("Successfully created user: {}", username);
    Ok(())
}

/// Check if a user exists in 1Password vault
pub fn user_exists(vault: &str, username: &str) -> bool {
    get_item_field(vault, username, "username").is_ok()
}

