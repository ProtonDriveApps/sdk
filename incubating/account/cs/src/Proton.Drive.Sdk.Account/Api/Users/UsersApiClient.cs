using Proton.Drive.Sdk.Account.Serialization;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Account.Api.Users;

internal sealed class UsersApiClient(HttpClient httpClient) : IUsersApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<UserResponse> GetAuthenticatedUserAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.UserResponse)
            .GetAsync("core/v4/users", cancellationToken).ConfigureAwait(false);
    }
}
