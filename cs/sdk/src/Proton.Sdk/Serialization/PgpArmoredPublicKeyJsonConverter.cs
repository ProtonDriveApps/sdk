using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredPublicKeyJsonConverter : PgpArmoredBlockJsonConverterBase<PgpArmoredPublicKey>
{
    protected override PgpBlockType BlockType => PgpBlockType.PublicKey;

    protected override PgpArmoredPublicKey CreateValue(ReadOnlyMemory<byte> bytes) => new(bytes);
}
