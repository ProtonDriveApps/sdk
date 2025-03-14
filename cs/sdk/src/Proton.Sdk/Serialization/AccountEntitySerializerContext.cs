using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Authentication;
using Proton.Sdk.Events;
using Proton.Sdk.Users;

namespace Proton.Sdk.Serialization;

[JsonSourceGenerationOptions(
    Converters =
    [
        typeof(StrongIdJsonConverter<SessionId>),
        typeof(StrongIdJsonConverter<UserId>),
        typeof(StrongIdJsonConverter<UserKeyId>),
        typeof(StrongIdJsonConverter<AddressId>),
        typeof(StrongIdJsonConverter<AddressKeyId>),
        typeof(StrongIdJsonConverter<EventId>),
    ])]
[JsonSerializable(typeof(Address))]
internal sealed partial class AccountEntitySerializerContext : JsonSerializerContext;
