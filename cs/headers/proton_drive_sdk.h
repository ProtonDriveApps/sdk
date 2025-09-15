#ifndef PROTON_DRIVE_SDK_H
#define PROTON_DRIVE_SDK_H

#include <stdint.h>
#include <stdbool.h>

#include "proton_sdk.h"

void proton_drive_sdk_handle_request(
    ByteArray request,
    const void* caller_state,
    array_action response_callback
);

void proton_drive_sdk_handle_response(
    const void* state,
    ByteArray response
);

#endif // PROTON_DRIVE_SDK_H
