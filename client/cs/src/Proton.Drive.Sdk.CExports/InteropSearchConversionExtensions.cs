using SdkDriveSearchHit = Proton.Drive.Sdk.Search.DriveSearchHit;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropSearchConversionExtensions
{
    extension(SdkDriveSearchHit hit)
    {
        public SearchHit ToInterop()
            => new()
            {
                Identifier = hit.NodeUid.ToString(),
                Score = hit.Score,
            };
    }
}
