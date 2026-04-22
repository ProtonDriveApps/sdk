using System.Text.Json;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionErrorResponse : ApiResponse
{
    private Lazy<RevisionConflict?>? _conflict;

    public JsonElement? Details { get; init; }

    public RevisionConflict? Conflict
    {
        get
        {
            return (_conflict ??= new Lazy<RevisionConflict?>(() => Code is ResponseCode.AlreadyExists && Details is not null
                ? Details.Value.Deserialize(DriveApiSerializerContext.Default.RevisionConflict)
                : null)).Value;
        }

        init
        {
            _conflict = new Lazy<RevisionConflict?>(value);
        }
    }
}
