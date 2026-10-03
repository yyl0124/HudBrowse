use crate::{models::TargetState, targets, window_manager::WindowManager};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    schema_version: u32,
    states: Vec<TargetState>,
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path_resolver()
        .app_data_dir()
        .ok_or("Missing app data directory")?
        .join("session.json"))
}
#[tauri::command]
pub fn save_session(app: AppHandle) -> Result<(), String> {
    let manager = app.state::<WindowManager>();
    let mut states: Vec<_> = manager
        .configs()
        .iter()
        .map(|config| targets::target_state(config, &manager))
        .collect();
    states.sort_by(|left, right| left.id.cmp(&right.id));
    let path = path(&app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec(&Session {
        schema_version: 2,
        states,
    })
    .map_err(|e| e.to_string())?;
    if std::fs::read(&path).ok().as_ref() == Some(&data) {
        return Ok(());
    }
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, data).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn load_session(app: AppHandle) -> Result<Vec<TargetState>, String> {
    let path = path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    match serde_json::from_slice::<Session>(&data) {
        Ok(session) if session.schema_version == 2 => Ok(session.states),
        _ => {
            let backup = path.with_extension(format!(
                "backup-{}.json",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            ));
            std::fs::copy(path, backup).map_err(|e| e.to_string())?;
            Ok(Vec::new())
        }
    }
}
