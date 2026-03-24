# Usage Examples

All examples assume:

```go
import protondrive "github.com/ProtonDriveApps/sdk/go"
```

## Creating a Client

### Login (simplest)

`BaseURL` is optional and defaults to the production API.

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:   "user@proton.me",
    Password:   "your-password",
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

### Login with session persistence hooks

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:   "user@proton.me",
    Password:   "your-password",
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{
    OnSession: func(session protondrive.Session) {
        // Persist session.UID, session.AccessToken,
        // session.RefreshToken, session.SaltedKeyPass
        // for later resume.
    },
    OnDeauth: func() {
        // Clear persisted session.
    },
})
if err != nil {
    log.Fatal(err)
}
defer client.Logout(ctx)
```

### Login with TOTP two-factor authentication

Provide the base32 TOTP secret key and the SDK generates the 6-digit code
automatically at login time.

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:   "user@proton.me",
    Password:   "your-password",
    TOTPSecret: "JBSWY3DPEHPK3PXP", // base32-encoded TOTP secret
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

Alternatively, pass a pre-generated 6-digit code via `TwoFactorCode`:

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:      "user@proton.me",
    Password:      "your-password",
    TwoFactorCode: "123456",
    AppVersion:    "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

### Login with mailbox password (two-password mode)

Some Proton accounts use a separate mailbox password for key decryption. Provide
it via `MailboxPassword`.

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:        "user@proton.me",
    Password:        "login-password",
    MailboxPassword: "mailbox-password",
    AppVersion:      "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

### Login to a staging environment

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    BaseURL:    "https://protonmail.blue/api",
    Username:   "user@proton.me",
    Password:   "your-password",
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

### Resume a saved session

```go
client, err := protondrive.NewClientWithSession(ctx, protondrive.NewDialer(), protondrive.ResumeOptions{
    Session: protondrive.Session{
        UID:           savedUID,
        AccessToken:   savedAccessToken,
        RefreshToken:  savedRefreshToken,
        SaltedKeyPass: savedSaltedKeyPass,
    },
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{})
```

### Inject a fake driver (for tests)

```go
fake := &protondrive.FakeDriver{
    RootValue: "root-id",
    Entries: []protondrive.DirectoryEntry{
        {Node: protondrive.Node{ID: "1", Name: "file.txt"}, IsFolder: false},
    },
}
client, err := protondrive.NewClientFromDriver(fake, protondrive.SessionHooks{})
```

## Storage Quota

```go
about, err := client.About(ctx)
if err != nil {
    log.Fatal(err)
}
fmt.Printf("Used %d of %d bytes (%d free)\n", about.Used, about.Total, about.Free)
```

## Directory Listing

```go
rootID, err := client.RootID(ctx)
if err != nil {
    log.Fatal(err)
}

entries, err := client.ListDirectory(ctx, rootID)
if err != nil {
    log.Fatal(err)
}
for _, entry := range entries {
    kind := "file"
    if entry.IsFolder {
        kind = "folder"
    }
    fmt.Printf("%s: %s (%d bytes)\n", kind, entry.Node.Name, entry.Node.Size)
}
```

## Searching for a Child

```go
node, err := client.SearchChild(ctx, parentID, "document.pdf", protondrive.NodeTypeFile)
if err != nil {
    log.Fatal(err)
}
if node == nil {
    fmt.Println("not found")
} else {
    fmt.Printf("found: %s (id=%s)\n", node.Name, node.ID)
}
```

## Creating a Folder

```go
folderID, err := client.CreateFolder(ctx, parentID, "my-folder")
if err != nil {
    log.Fatal(err)
}
fmt.Printf("created folder: %s\n", folderID)
```

## Uploading a File

### Small file (up to 4 MiB)

```go
content := strings.NewReader("hello world")
node, attrs, err := client.UploadFile(ctx, parentID, "hello.txt", content, protondrive.UploadOptions{
    KnownSize: int64(len("hello world")),
    ModTime:   time.Now().UTC(),
})
if err != nil {
    log.Fatal(err)
}
fmt.Printf("uploaded %s, SHA1=%s\n", node.Name, attrs.Digests["SHA1"])
```

### Large file (>4 MiB)

```go
file, err := os.Open("large-video.mp4")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

info, err := file.Stat()
if err != nil {
    log.Fatal(err)
}

node, attrs, err := client.UploadFile(ctx, parentID, "large-video.mp4", file, protondrive.UploadOptions{
    KnownSize: info.Size(),
    ModTime:   info.ModTime(),
    MediaType: "video/mp4",
})
if err != nil {
    log.Fatal(err)
}
fmt.Printf("uploaded %s (%d bytes)\n", node.Name, attrs.Size)
```

## Downloading a File

```go
result, err := client.DownloadFile(ctx, nodeID, 0)
if err != nil {
    log.Fatal(err)
}
defer result.Reader.Close()

data, err := io.ReadAll(result.Reader)
if err != nil {
    log.Fatal(err)
}
fmt.Printf("downloaded %d bytes, SHA1=%s\n", len(data), result.Attrs.Digests["SHA1"])
```

### Download from offset

```go
result, err := client.DownloadFile(ctx, nodeID, 1024) // skip first 1KB
if err != nil {
    log.Fatal(err)
}
defer result.Reader.Close()
```

## Getting Revision Metadata

```go
attrs, err := client.GetRevisionAttrs(ctx, nodeID)
if err != nil {
    log.Fatal(err)
}
fmt.Printf("size=%d encrypted=%d blocks=%d\n", attrs.Size, attrs.EncryptedSize, len(attrs.BlockSizes))
```

## Moving Files and Folders

```go
// Move a file into a different folder, optionally renaming
err = client.MoveFile(ctx, fileID, newParentID, "renamed.txt")

// Move a folder
err = client.MoveFolder(ctx, folderID, newParentID, "renamed-folder")
```

## Trash Operations

```go
// Trash individual items
err = client.TrashFile(ctx, fileID)
err = client.TrashFolder(ctx, folderID, true)

// Permanently delete all trashed items
err = client.EmptyTrash(ctx)
```

## Cache Management

```go
// Clear the driver's in-memory node cache after mutations
client.ClearCache()
```

## Logout

```go
err = client.Logout(ctx)
// Session is now invalid; OnDeauth hook fires on success.
```
