namespace Proton.Drive.Sdk.Telemetry;

// Numeric values must match the UploadSizeClass enum in proton.drive.sdk.proto.
public enum UploadSizeClass
{
    Unspecified = 0,
    Small = 1,
    Single = 2,
    Multi = 3,
}
