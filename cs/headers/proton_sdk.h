#ifndef PROTON_SDK_H
#define PROTON_SDK_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    const uint8_t* pointer;
    size_t length;
} ByteArray;

typedef void array_action(const void* state, ByteArray array);

void override_native_library_name(
    ByteArray library_name,
    ByteArray overriding_library_name
);

void proton_sdk_handle_request(
    ByteArray request,
    const void* caller_state,
    array_action response_action
);

#endif // PROTON_SDK_H
