namespace Proton.Drive.Sdk.Account.Api;

internal sealed class ApiClientFactory : IApiClientFactory
{
    private ApiClientFactory()
    {
    }

    public static IApiClientFactory Instance { get; set; } = new ApiClientFactory();
}
