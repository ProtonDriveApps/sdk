namespace Proton.Drive.Sdk;

internal static class ProtonDriveDefaults
{
    public const int StorageApiTimeoutSeconds = 300;

    public const string BaseRoute = "drive/";

    public static Uri BaseUrl { get; } = new("https://drive-api.proton.me/");
}
