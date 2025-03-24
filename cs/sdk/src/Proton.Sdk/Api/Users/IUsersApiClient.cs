namespace Proton.Sdk.Api.Users;

internal interface IUsersApiClient
{
    Task<UserResponse> GetAuthenticatedUserAsync(CancellationToken cancellationToken);
}
