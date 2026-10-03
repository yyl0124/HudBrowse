use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSettings {
    pub opacity: f64,
    pub hide_on_mouse_leave: bool,
    pub mouse_through: bool,
    pub auto_hide_on_edge: bool,
    pub always_on_top: bool,
    pub default_width: f64,
    pub default_height: f64,
}

impl Default for WindowSettings {
    fn default() -> Self {
        Self {
            opacity: 100.0,
            hide_on_mouse_leave: false,
            mouse_through: false,
            auto_hide_on_edge: false,
            always_on_top: true,
            default_width: 800.0,
            default_height: 600.0,
        }
    }
}
impl WindowSettings {
    pub fn validate(&self) -> Result<(), String> {
        if !self.opacity.is_finite()
            || !(10.0..=100.0).contains(&self.opacity)
            || !self.default_width.is_finite()
            || !(200.0..=3840.0).contains(&self.default_width)
            || !self.default_height.is_finite()
            || !(200.0..=2160.0).contains(&self.default_height)
            || (self.auto_hide_on_edge && self.hide_on_mouse_leave)
        {
            return Err("Invalid window settings".into());
        }
        Ok(())
    }
    pub fn alpha(&self) -> u8 {
        (self.opacity * 255.0 / 100.0).round() as u8
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlConfig {
    pub id: String,
    #[serde(default = "web_type", rename = "type")]
    pub kind: String,
    pub url: String,
    pub name: String,
    pub hotkey: String,
    pub category: Option<String>,
    pub settings: Option<WindowSettings>,
    pub last_position: Option<Position>,
    pub last_size: Option<Size>,
    pub created_at: i64,
    pub updated_at: i64,
    pub window_info: Option<crate::window_capture::WindowInfo>,
}
fn web_type() -> String {
    "url".into()
}
impl UrlConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty()
            || self.id == "main"
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return Err("Invalid target id".into());
        }
        self.settings.clone().unwrap_or_default().validate()?;
        if self.kind == "window" {
            if self.window_info.is_none() {
                return Err("Missing captured window identity".into());
            }
        } else if self.kind == "url" {
            let url = url::Url::parse(&self.url).map_err(|e| e.to_string())?;
            if !matches!(url.scheme(), "http" | "https") {
                return Err("Only HTTP/HTTPS URLs are supported".into());
            }
        } else {
            return Err("Unknown target type".into());
        }
        if self
            .last_position
            .as_ref()
            .is_some_and(|p| !p.x.is_finite() || !p.y.is_finite())
            || self.last_size.as_ref().is_some_and(|s| {
                !s.width.is_finite()
                    || !s.height.is_finite()
                    || s.width < 1.0
                    || s.height < 1.0
                    || s.width > 65535.0
                    || s.height > 65535.0
            })
        {
            return Err("Invalid window geometry".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetState {
    pub id: String,
    pub exists: bool,
    pub visible: bool,
    pub minimized: bool,
    pub position: Option<Position>,
    pub size: Option<Size>,
    pub hwnd: Option<isize>,
}
impl TargetState {
    pub fn missing(id: String) -> Self {
        Self {
            id,
            exists: false,
            visible: false,
            minimized: false,
            position: None,
            size: None,
            hwnd: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn opaque_is_255() {
        assert_eq!(WindowSettings::default().alpha(), 255);
    }
    #[test]
    fn rejects_conflicting_hide_modes_and_nan() {
        let mut settings = WindowSettings {
            auto_hide_on_edge: true,
            hide_on_mouse_leave: true,
            ..WindowSettings::default()
        };
        assert!(settings.validate().is_err());
        settings.hide_on_mouse_leave = false;
        settings.opacity = f64::NAN;
        assert!(settings.validate().is_err());
    }
}
