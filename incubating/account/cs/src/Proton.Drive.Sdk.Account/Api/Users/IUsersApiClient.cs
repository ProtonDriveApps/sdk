namespace Proton.Drive.Sdk.Account.Api.Users;

internal interface IUsersApiClient
{
    Task<UserResponse> GetAuthenticatedUserAsync(CancellationToken cancellationToken);
}
