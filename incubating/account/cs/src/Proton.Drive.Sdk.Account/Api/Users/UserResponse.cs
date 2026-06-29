using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Users;

internal sealed class UserResponse : ApiResponse
{
    public required UserDto User { get; init; }
}
