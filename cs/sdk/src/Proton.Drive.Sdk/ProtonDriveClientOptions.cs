namespace Proton.Drive.Sdk;

public record struct ProtonDriveClientOptions(
    string? BindingsLanguage,
    string? Uid,
    int? OverrideDefaultApiTimeoutSeconds,
    int? OverrideStorageApiTimeoutSeconds);
