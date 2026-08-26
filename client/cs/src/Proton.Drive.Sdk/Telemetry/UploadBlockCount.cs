namespace Proton.Drive.Sdk.Telemetry;

// Numeric values must match the UploadBlockCount enum in proton.drive.sdk.proto.
public enum UploadBlockCount
{
    Unspecified = 0,
    Single = 1,
    Few = 2,
    Many = 3,
}
