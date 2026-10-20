namespace Proton.Drive.Sdk;

public partial record struct ProtonDriveClientOptions(
    string? Uid = null,
    string? BindingsLanguage = null,
    int? DefaultApiTimeoutSecondsOverride = null,
    int? StorageApiTimeoutSecondsOverride = null,
    int? DegreeOfBlockTransferParallelismOverride = null);
