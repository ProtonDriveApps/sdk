namespace Proton.Sdk.Authentication.Api;

internal readonly struct SessionInitiationRequest(string username)
{
    public string Username => username;
}
