# Additional Node Metadata

Optional module for generating and parsing additional node metadata. It parses the exif and other attributes from the file and builds a unified metadata object. Pass the output to the uploader and then parse it back when you retrieve the node.

The metadata includes GPS location, camera information, media dimensions and other fields. The intention is to extract these fields for faster search and filtering in the future.

Uploading a regular file:

```typescript
import { generateAdditionalNodeMetadata } from '@protontech/drive-sdk/additionalNodeMetadata';

const { additionalMetadata } = await generateAdditionalNodeMetadata(file, mediaType, mediaInfo);

const uploader = sdk.getFileUploader(parentNodeUid, file.name, {
    mediaType: file.type,
    expectedSize: file.size,
    expectedSha1,
    additionalMetadata,
});
const controller = uploader.uploadFromFile(file, thumbnails);
await controller.completion();
```

Uploading a photo file to photo section:

```typescript
import { generateAdditionalPhotoNodeMetadata } from '@protontech/drive-sdk/additionalNodeMetadata';

const { additionalMetadata, captureTime, tags } = await generateAdditionalPhotoNodeMetadata(file, mediaType, mediaInfo);

const uploader = sdk.getFileUploader(file.name, {
    mediaType: file.type,
    expectedSize: file.size,
    expectedSha1,
    additionalMetadata,
    captureTime,
    tags,
});
const controller = uploader.uploadFromFile(file, thumbnails);
await controller.completion();
```

Parsing the additional metadata from the node:

```typescript
import { parseAdditionalNodeMetadata } from '@protontech/drive-sdk/additionalNodeMetadata';

const node = await sdk.getNode(nodeUid);

const additionalMetadata = parseAdditionalNodeMetadata(node.activeRevision.claimedAdditionalMetadata);
if (additionalMetadata.location) {
    console.log(`Location: ${additionalMetadata.location.latitude}, ${additionalMetadata.location.longitude}`);
}
if (additionalMetadata.media) {
    console.log(`Media dimensions: ${additionalMetadata.media.width}, ${additionalMetadata.media.height}`);
}
```
