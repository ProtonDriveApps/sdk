#ifndef PROTON_SDK_H
#define PROTON_SDK_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    const uint8_t* pointer;
    size_t length;
} ByteArray;

typedef void ArrayFunction(const void* state, ByteArray array);

typedef struct {
    ArrayFunction* success_function;
    ArrayFunction* failure_function;
    intptr_t cancellation_token_source_handle;
} AsyncArrayCallback;

typedef struct {
    void (*success_function)(const void* state, int returnValue);
    ArrayFunction* failure_function;
    intptr_t cancellation_token_source_handle;
} AsyncIntCallback;

typedef struct {
    void (*success_function)(const void* state);
    ArrayFunction* failure_function;
    intptr_t cancellation_token_source_handle;
} AsyncVoidCallback;

typedef struct {
    ArrayFunction* function;
} ArrayCallback;

// These callbacks receive yet another callback to allow asynchronous read/writes
typedef void ReadCallback(const void* state, ByteArray buffer, const void* caller_state, AsyncIntCallback callback);
typedef void WriteCallback(const void* state, ByteArray buffer, const void* caller_state, AsyncVoidCallback callback);

intptr_t cancellation_token_source_create();

void cancellation_token_source_cancel(
    intptr_t cancellation_token_source_handle
);

void cancellation_token_source_free(
    intptr_t cancellation_token_source_handle
);

int session_begin(
    ByteArray request,
    const void* caller_state,
    AsyncArrayCallback result_callback
);

int session_resume(
    ByteArray request,
    intptr_t* session_handle
);

int session_renew(
    intptr_t old_session_handle,
    ByteArray request,
    intptr_t* new_session_handle
);

int session_end(
    intptr_t session_handle,
    const void* caller_state,
    AsyncVoidCallback result_callback
);

intptr_t session_tokens_refreshed_subscribe(
    intptr_t session_handle,
    const void* caller_state,
    ArrayCallback tokens_refreshed_callback
);

void session_tokens_refreshed_unsubscribe(
    intptr_t subscription_handle
);

void session_free(intptr_t session_handle);

int logger_provider_create(
    ArrayCallback log_callback,
    intptr_t* logger_provider_handle
);

// Drive

intptr_t drive_client_create(
    intptr_t session_handle
);

void drive_client_free(intptr_t client_handle);

int get_file_uploader(
    intptr_t client_handle,
    ByteArray request, // FileUploaderProvisionRequest
    const void* caller_state,
    AsyncArrayCallback result_callback
);

intptr_t upload_from_stream(
    intptr_t uploader_handle,
    ByteArray request, // FileUploadRequest
    const void* caller_state,
    ReadCallback* read_callback,
    AsyncArrayCallback progress_callback,
    intptr_t cancellation_token_source_handle
);

void file_uploader_free(intptr_t file_uploader_handle);

int upload_controller_set_completion_callback(
    intptr_t upload_controller_handle,
    const void* caller_state,
    AsyncArrayCallback result_callback);

void upload_controller_pause(intptr_t file_uploader_handle);

void upload_controller_resume(intptr_t file_uploader_handle);

void upload_controller_free(intptr_t file_uploader_handle);

int get_file_downloader(
    intptr_t client_handle,
    ByteArray request, // FileDownloaderProvisionRequest
    const void* caller_state,
    AsyncArrayCallback result_callback
);

intptr_t download_to_stream(
    intptr_t downloader_handle,
    const void* caller_state,
    WriteCallback* write_callback,
    AsyncArrayCallback progress_callback,
    intptr_t cancellation_token_source_handle
);

void file_downloader_free(intptr_t file_downloader_handle);

int download_controller_set_completion_callback(
    intptr_t download_controller_handle,
    const void* caller_state,
    AsyncArrayCallback result_callback
);

void download_controller_pause(intptr_t file_downloader_handle);

void download_controller_resume(intptr_t file_downloader_handle);

void download_controller_free(intptr_t file_downloader_handle);

#endif // PROTON_SDK_H
