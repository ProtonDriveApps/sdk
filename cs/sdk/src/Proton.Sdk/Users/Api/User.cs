using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users.Api;

internal sealed class User
{
    [JsonPropertyName("ID")]
    public required UserId Id { get; init; }

    public required string Name { get; init; }
    public required string DisplayName { get; init; }

    [JsonPropertyName("Email")]
    public required string EmailAddress { get; init; }

    public UserType Type { get; init; }

    public required long MaxSpace { get; init; }
    public required long UsedSpace { get; init; }

    [JsonPropertyName("Private")]
    [JsonConverter(typeof(BooleanToIntegerJsonConverter))]
    public required bool IsPrivate { get; init; }

    [JsonPropertyName("Subscribed")]
    public required Subscriptions Subscriptions { get; init; }

    [JsonPropertyName("Services")]
    public required Services ActiveServices { get; init; }

    [JsonPropertyName("Delinquent")]
    public DelinquentState DelinquentState { get; init; }

    public required IReadOnlyList<UserKey> Keys { get; init; }
}
