namespace Proton.Sdk;

internal static class ProtonApiDefaults
{
    public static Uri BaseUrl { get; } = new("https://drive-api.proton.me/");

    public static Uri RefreshRedirectUri { get; } = new("https://proton.me");
}
