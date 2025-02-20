namespace Proton.Sdk.Addresses;

public sealed class Address(AddressId id, int order, string emailAddress, AddressStatus status, IReadOnlyList<AddressKey> keys, int primaryKeyIndex)
{
    public AddressId Id { get; } = id;
    public int Order { get; } = order;
    public string EmailAddress { get; } = emailAddress;
    public AddressStatus Status { get; } = status;
    public IReadOnlyList<AddressKey> Keys { get; } = keys;
    public int PrimaryKeyIndex { get; } = primaryKeyIndex;

    public AddressKey PrimaryKey => Keys[PrimaryKeyIndex];
}
