using Proton.Sdk.Api;

namespace Proton.Sdk.Api.Users;

internal sealed class UserResponse : ApiResponse
{
    public required UserDto User { get; init; }
}
