use std::error::Error;

struct Device {
    uid: String,
    device_type: DeviceType,
    name: Result<String, Option<&'static dyn Error>>,
    root_folder_u_id: String,
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
