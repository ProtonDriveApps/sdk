namespace Proton.Drive.Sdk.Account.Api.Authentication;

internal readonly struct SessionInitiationRequest(string username)
{
    public string Username => username;
}
