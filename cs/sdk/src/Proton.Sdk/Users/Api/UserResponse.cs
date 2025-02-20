using Proton.Sdk.Api;

namespace Proton.Sdk.Users.Api;

internal sealed class UserResponse : ApiResponse
{
    public required User User { get; init; }
}
