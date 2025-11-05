using System.Reflection;

namespace Proton.Sdk.Http;

internal sealed class SdkHttpClientFactoryDecorator : IHttpClientFactory
{
    private static readonly string SdkVersion = GetSdkVersion();

    private readonly IHttpClientFactory _instanceToDecorate;
    private readonly string _sdkTechnicalStack;

    public SdkHttpClientFactoryDecorator(IHttpClientFactory instanceToDecorate, string? bindingsLanguage = null)
    {
        _instanceToDecorate = instanceToDecorate;

        var bindingsSuffix = bindingsLanguage is not null
            ? "-" + bindingsLanguage.ToLowerInvariant()
            : string.Empty;

        _sdkTechnicalStack = "dotnet" + bindingsSuffix;
    }

    public HttpClient CreateClient(string name)
    {
        var client = _instanceToDecorate.CreateClient(name);

        client.DefaultRequestHeaders.Add("x-pm-drive-sdk-version", $"{_sdkTechnicalStack}@{SdkVersion}");

        return client;
    }

    private static string GetSdkVersion()
    {
        var executingAssembly = Assembly.GetExecutingAssembly();
        var versionAttribute = executingAssembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
        return versionAttribute?.InformationalVersion
            ?? executingAssembly.GetName().Version?.ToString(fieldCount: 3)
            ?? "0.0.0";
    }
}
