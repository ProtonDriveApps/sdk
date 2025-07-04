#ifndef PROTON_SDK_H
#define PROTON_SDK_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    const uint8_t* pointer;
    size_t length;
} ByteArray;

typedef struct {
    const void* state;
    void (*on_success)(const void*, ByteArray);
    void (*on_failure)(const void*, ByteArray); 
    intptr_t cancellation_token_source_handle;
} AsyncCallback;

typedef struct {
    const void* state;
    void (*callback)(const void*, ByteArray);
} Callback;

typedef struct {
    AsyncCallback async_callback;
    Callback progress_callback;
} AsyncCallbackWithProgress;

intptr_t cancellation_token_source_create();

void cancellation_token_source_cancel(
    intptr_t cancellation_token_source_handle
);

void cancellation_token_source_free(
    intptr_t cancellation_token_source_handle
);

int session_begin(
    ByteArray request,
    AsyncCallback callback
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
    AsyncCallback callback
);

void session_free(intptr_t session_handle);

int logger_provider_create(
    Callback log_callback,
    intptr_t* logger_provider_handle
);

#endif PROTON_SDK_H
