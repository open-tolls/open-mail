#[tauri::command]
pub async fn health_check() -> Result<String, String> {
    Ok("Open Mail backend running".to_string())
}
