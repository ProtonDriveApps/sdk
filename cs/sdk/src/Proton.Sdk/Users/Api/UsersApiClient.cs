using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users.Api;

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
