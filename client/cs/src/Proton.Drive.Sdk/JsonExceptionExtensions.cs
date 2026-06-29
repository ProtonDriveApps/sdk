using System.Text.Json;

namespace Proton.Drive.Sdk;

internal static class JsonExceptionExtensions
{
    internal static ProtonDriveError ToEnrichedProtonDriveError(this JsonException e, ReadOnlyMemory<byte> json)
    {
        if (e.Path is not { Length: > 0 })
        {
            return e.ToProtonDriveError();
        }

        try
        {
            using var doc = JsonDocument.Parse(json);

            if (!TryGetElementAtPath(doc.RootElement, e.Path, out var element))
            {
                return e.ToProtonDriveError();
            }

            return new ProtonDriveError($"Actual token at path '{e.Path}' is {ValueKindToToken(element.ValueKind)}.", e.ToProtonDriveError());
        }
        catch (JsonException)
        {
            // Secondary parse failed.
            return e.ToProtonDriveError();
        }
    }

    private static bool TryGetElementAtPath(JsonElement root, string path, out JsonElement element)
    {
        element = root;

        var segments = path.Split('.');

        // segments[0] is always the "$" root sigil — start from index 1
        for (var i = 1; i < segments.Length; i++)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(segments[i], out element))
            {
                return false;
            }
        }

        return true;
    }

    private static string ValueKindToToken(JsonValueKind kind) => kind switch
    {
        JsonValueKind.Object => "object '{'",
        JsonValueKind.Array => "array '['",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Null => "null",
        _ => kind.ToString(),
    };
}
