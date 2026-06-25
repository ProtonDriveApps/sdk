namespace Proton.Sdk;

public static class ProtonApiDefaults
{
    public const double DefaultTimeoutSeconds = 30;

    public static Uri BaseUrl { get; } = new("https://drive-api.proton.me/");
}
