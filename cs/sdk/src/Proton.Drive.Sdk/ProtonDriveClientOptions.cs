namespace Proton.Drive.Sdk;

public record struct ProtonDriveClientOptions(
    string? Uid,
    string? BindingsLanguage,
    int? DefaultApiTimeoutSecondsOverride,
    int? StorageApiTimeoutSecondsOverride,
    int? DegreeOfBlockTransferParallelismOverride);
