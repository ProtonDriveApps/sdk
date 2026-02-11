namespace Proton.Sdk.Api.Users;

internal sealed class UserResponse : ApiResponse
{
    public required UserDto User { get; init; }
}
