using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredPrivateKeyJsonConverter : PgpArmoredBlockJsonConverterBase<PgpArmoredPrivateKey>
{
    protected override PgpBlockType BlockType => PgpBlockType.PrivateKey;

    protected override PgpArmoredPrivateKey CreateValue(ReadOnlyMemory<byte> bytes) => new(bytes);
}
