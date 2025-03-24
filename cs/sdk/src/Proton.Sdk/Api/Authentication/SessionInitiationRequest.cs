namespace Proton.Sdk.Api.Authentication;

internal readonly struct SessionInitiationRequest(string username)
{
    public string Username => username;
}
