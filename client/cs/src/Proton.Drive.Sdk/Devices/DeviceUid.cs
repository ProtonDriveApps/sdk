using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Devices;

[JsonConverter(typeof(UidJsonConverter<DeviceUid>))]
public readonly record struct DeviceUid : ICompositeUid<DeviceUid>
{
    internal DeviceUid(VolumeId volumeId, DeviceId deviceId)
    {
        VolumeId = volumeId;
        DeviceId = deviceId;
    }

    internal VolumeId VolumeId { get; }
    internal DeviceId DeviceId { get; }

    public override string ToString()
    {
        return $"{VolumeId}~{DeviceId}";
    }

    public static bool TryParse(string s, [NotNullWhen(true)] out DeviceUid? result)
    {
        return ICompositeUid<DeviceUid>.TryParse(s, out result);
    }

    public static DeviceUid Parse(string s)
    {
        return ICompositeUid<DeviceUid>.TryParse(s, out var result)
            ? result.Value
            : throw new FormatException($"Invalid device UID format: \"{s}\"");
    }

    static bool ICompositeUid<DeviceUid>.TryCreate(string baseUidString, string relativeIdString, [NotNullWhen(true)] out DeviceUid? uid)
    {
        uid = new DeviceUid(new VolumeId(baseUidString), new DeviceId(relativeIdString));
        return true;
    }

    internal void Deconstruct(out VolumeId volumeId, out DeviceId deviceId)
    {
        volumeId = VolumeId;
        deviceId = DeviceId;
    }
}
