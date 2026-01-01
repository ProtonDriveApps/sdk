struct Device<'t> {
    uid: &'t str,
    device_type: DeviceType,
    name: Result<&'t str, Option<&'static str>>, // Err | InvalidNameError
    root_folder_u_id: &'t str,
    creation_time: chrono::DateTime<chrono::Utc>,
    last_sync_date: chrono::DateTime<chrono::Utc>,
}

enum DeviceType {
    Windows,
    MacOS,
    Linux,
}

impl DeviceType {
    fn to_str(&self) -> &'static str {
        match self {
            Self::Windows => "Windows",
            Self::MacOS => "MacOS",
            Self::Linux => "Linux",
        }
    }
}