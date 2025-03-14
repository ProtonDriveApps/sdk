using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes.Api;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

[JsonSerializable(typeof(VolumeCreationParameters))]
[JsonSerializable(typeof(VolumeCreationResponse))]
internal partial class DriveApiSerializerContext : JsonSerializerContext
{
    static DriveApiSerializerContext()
    {
        Default = new DriveApiSerializerContext(ProtonApiSerializerContext.Default.Options);
    }
}
