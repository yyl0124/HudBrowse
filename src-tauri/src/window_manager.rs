use crate::{captured::OriginalWindow, models::UrlConfig};
use std::{collections::HashMap, sync::Mutex};
use tauri::Window;

#[derive(Default)]
pub struct WindowManager {
    pub operation: Mutex<()>,
    pub windows: Mutex<HashMap<String, Window>>,
    pub configs: Mutex<HashMap<String, UrlConfig>>,
    pub originals: Mutex<HashMap<isize, OriginalWindow>>,
}
impl WindowManager {
    pub fn window(&self, id: &str) -> Option<Window> {
        self.windows.lock().unwrap().get(id).cloned()
    }
    pub fn configs(&self) -> Vec<UrlConfig> {
        self.configs.lock().unwrap().values().cloned().collect()
    }
    pub fn remember(&self, config: UrlConfig) {
        self.configs
            .lock()
            .unwrap()
            .insert(config.id.clone(), config);
    }
}
