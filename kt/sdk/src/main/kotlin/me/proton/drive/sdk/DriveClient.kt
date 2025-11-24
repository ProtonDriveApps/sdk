package me.proton.drive.sdk

import me.proton.drive.sdk.ProtonDriveSdk.cancellationTokenSource
import me.proton.drive.sdk.entity.ThumbnailType
import me.proton.drive.sdk.extension.toProto
import me.proton.drive.sdk.internal.JniDriveClient
import proton.drive.sdk.driveClientGetAvailableNameRequest
import proton.drive.sdk.driveClientGetThumbnailsRequest
import java.io.OutputStream

class DriveClient internal constructor(
    internal val handle: Long,
    private val bridge: JniDriveClient,
    session: Session? = null,
) : SdkNode(session), AutoCloseable {

    suspend fun getAvailableName(
        parentFolderUid: String,
        name: String,
    ): String = cancellationTokenSource().let { source ->
        bridge.getAvailableName(
            driveClientGetAvailableNameRequest {
                this.parentFolderUid = parentFolderUid
                this.name = name
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        )
    }

    suspend fun getThumbnails(
        fileUids: List<String>,
        type: ThumbnailType,
        block: (String) -> OutputStream,
    ): Unit = cancellationTokenSource().let { source ->
        bridge.getThumbnails(
            driveClientGetThumbnailsRequest {
                this.fileUids += fileUids
                this.type = type.toProto()
                clientHandle = handle
                cancellationTokenSourceHandle = source.handle
            }
        ).thumbnailsList.forEach { fileThumbnail ->
            block(fileThumbnail.fileUid).use { outputStream ->
                outputStream.write(fileThumbnail.data.toByteArray())
            }
        }
    }

    override fun close() {
        bridge.free(handle)
        super.close()
    }
}

suspend fun Session.driveClientCreate(): DriveClient = JniDriveClient().run {
    val session = this@driveClientCreate
    DriveClient(
        session = session,
        handle = create(handle),
        bridge = this,
    )
}
