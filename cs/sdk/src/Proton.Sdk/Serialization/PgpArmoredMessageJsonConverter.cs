using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredMessageJsonConverter : PgpArmoredBlockJsonConverterBase<PgpArmoredMessage>
{
    protected override PgpBlockType BlockType => PgpBlockType.Message;

    protected override PgpArmoredMessage CreateValue(ReadOnlyMemory<byte> bytes) => new(bytes);
}
