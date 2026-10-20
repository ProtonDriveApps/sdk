using Proton.Sdk.Storage;

namespace Proton.Drive.Sdk;

public partial record struct ProtonDriveClientOptions
{
    /// <summary>
    /// Store holding the local search index. When not set, the index is kept in memory and lost when the client is released.
    /// Owned by the caller, who must keep it open until the client is no longer used.
    /// </summary>
    public IBinaryKeyValueStore? SearchIndexStore { get; set; }
}
