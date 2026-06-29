using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Devices;

internal static partial class DeviceOperations
{
    public static async IAsyncEnumerable<Device> EnumerateDevicesAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var devices = await GetDeviceMetadataAsync(client, cancellationToken).ConfigureAwait(false);

        var devicesByRootFolderUid = devices.ToDictionary(device => device.RootFolderUid);

        await foreach (var node in NodeOperations
            .EnumerateNodesAsync(client, devicesByRootFolderUid.Keys.ToAsyncEnumerable(), forPhotos: false, cancellationToken)
            .ConfigureAwait(false))
        {
            if (devicesByRootFolderUid.TryGetValue(node.Uid, out var device))
            {
                yield return ToDevice(device, node.Name);
            }
        }
    }

    public static async ValueTask<Device> CreateDeviceAsync(
        ProtonDriveClient client,
        string name,
        DeviceType deviceType,
        CancellationToken cancellationToken)
    {
        var myFilesFolder = await client.GetMyFilesFolderAsync(cancellationToken).ConfigureAwait(false);
        var volumeId = myFilesFolder.Uid.VolumeId;

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, myFilesFolder.Uid, cancellationToken).ConfigureAwait(false);
        var addressKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);
        var addressKeyId = membershipAddress.GetPrimaryKey().AddressKeyId;

        var request = DeviceCrypto.GetCreationRequest(name, deviceType, membershipAddress.Id, addressKeyId, addressKey);

        var response = await client.Api.Devices.CreateDeviceAsync(request, cancellationToken).ConfigureAwait(false);

#pragma warning disable CS0618 // Device.ShareId is deprecated but must still be populated
        return new Device
        {
            Uid = response.Device.Id,
            Type = deviceType,
            Name = name,
            RootFolderUid = new NodeUid(volumeId, response.Device.RootLinkId),
            CreationTime = DateTime.UtcNow,
            LastSyncTime = null,
            ShareId = response.Device.ShareId.ToString(),
        };
#pragma warning restore CS0618
    }

    public static async ValueTask<Device> RenameDeviceAsync(
        ProtonDriveClient client,
        DeviceUid deviceUid,
        string name,
        CancellationToken cancellationToken)
    {
        var device = await GetDeviceMetadataAsync(client, deviceUid, cancellationToken).ConfigureAwait(false);

        if (device.HasDeprecatedName)
        {
            var logger = client.Telemetry.GetLogger("Devices");
            LogRemovingDeprecatedName(logger);

            try
            {
                await client.Api.Devices.RemoveNameFromDeviceAsync(device.Id, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                LogFailedToRemoveName(logger, exception);
            }
        }

        await RenameRootFolderAsync(client, device.ShareId, device.RootFolderUid, name, cancellationToken).ConfigureAwait(false);

        return ToDevice(device, name);
    }

    public static async ValueTask DeleteDeviceAsync(ProtonDriveClient client, DeviceUid deviceUid, CancellationToken cancellationToken)
    {
        await client.Api.Devices.DeleteDeviceAsync(deviceUid, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Renames the root folder of a device. A device's name lives on its root folder, which—being a root node—is
    /// renamed differently from a regular node: its name is encrypted with the device's share key and is not hashed
    /// (root nodes have no siblings). This is intentionally kept separate from <see cref="NodeOperations.RenameAsync"/>,
    /// which only renames non-root nodes.
    /// </summary>
    private static async ValueTask RenameRootFolderAsync(
        ProtonDriveClient client,
        ShareId shareId,
        NodeUid rootFolderUid,
        string name,
        CancellationToken cancellationToken)
    {
        var (node, secrets, membershipShareId, _) = await NodeOperations
            .GetNodeMetadataAsync(client, rootFolderUid, knownShareAndKey: null, useCacheOnly: false, forPhotos: false, cancellationToken)
            .ConfigureAwait(false);

        var nameSessionKey = secrets.NameSessionKey
            ?? throw new InvalidOperationException($"Name session key not available for {rootFolderUid}");

        // The root node's name is encrypted with the device's own (direct) share key, which also identifies the
        // membership address that owns the name signature.
        var (share, shareKey) = await ShareOperations.GetShareAsync(client, shareId, useCacheOnly: false, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await client.Account.GetAddressAsync(share.MembershipAddressId, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var request = DeviceCrypto.GetRenameRequest(name, shareKey, nameSessionKey, signingKey, membershipAddress.EmailAddress);

        await client.Api.Links.RenameAsync(rootFolderUid.VolumeId, rootFolderUid.LinkId, request, cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities
            .SetNodeAsync(rootFolderUid, node with { Name = name }, membershipShareId, nameHashDigest: ReadOnlyMemory<byte>.Empty, cancellationToken)
            .ConfigureAwait(false);
    }

    private static async ValueTask<DeviceMetadata> GetDeviceMetadataAsync(ProtonDriveClient client, DeviceUid deviceUid, CancellationToken cancellationToken)
    {
        var devices = await GetDeviceMetadataAsync(client, cancellationToken).ConfigureAwait(false);

        return devices.FirstOrDefault(device => device.Id == deviceUid)
            ?? throw new ValidationException("Device not found");
    }

    private static async ValueTask<IReadOnlyList<DeviceMetadata>> GetDeviceMetadataAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var response = await client.Api.Devices.GetDevicesAsync(cancellationToken).ConfigureAwait(false);

        return response.Devices.Select(item => new DeviceMetadata
        {
            Id = item.Device.Id,
            Type = item.Device.Type,
            RootFolderUid = new NodeUid(item.Device.VolumeId, item.Share.RootLinkId),
            CreationTime = item.Device.CreationTime,
            LastSyncTime = item.Device.LastSyncTime,
            HasDeprecatedName = !string.IsNullOrEmpty(item.Share.Name),
            ShareId = item.Share.Id,
        }).ToList();
    }

    private static Device ToDevice(DeviceMetadata device, Result<string, ProtonDriveError> name)
    {
#pragma warning disable CS0618 // Device.ShareId is deprecated but must still be populated
        return new Device
        {
            Uid = device.Id,
            Type = device.Type,
            Name = name,
            RootFolderUid = device.RootFolderUid,
            CreationTime = device.CreationTime,
            LastSyncTime = device.LastSyncTime,
            ShareId = device.ShareId.ToString(),
        };
#pragma warning restore CS0618
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Removing deprecated name from device")]
    private static partial void LogRemovingDeprecatedName(ILogger logger);

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to remove name from device")]
    private static partial void LogFailedToRemoveName(ILogger logger, Exception exception);
}
