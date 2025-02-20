namespace Proton.Sdk.Users.Api;

internal interface IUsersApiClient
{
    Task<UserResponse> GetAuthenticatedUserAsync(CancellationToken cancellationToken);
}
