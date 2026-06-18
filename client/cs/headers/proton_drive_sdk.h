#ifndef PROTON_DRIVE_SDK_H
#define PROTON_DRIVE_SDK_H

#include <stdint.h>
#include <stdbool.h>

#include "proton_sdk.h"

void proton_drive_sdk_handle_request(
    ByteArray request,
    intptr_t bindings_handle,
    array_action response_action
);

#endif // PROTON_DRIVE_SDK_H
