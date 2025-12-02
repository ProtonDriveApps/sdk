#include <jni.h>
#include "proton_drive_sdk.h"

#ifndef PROTONDRIVE_GLOBAL_H
#define PROTONDRIVE_GLOBAL_H

JNIEnv *getJNIEnv();

void pushDataToVoidMethod(
        intptr_t bindings_handle,
        ByteArray value,
        const char *name
);

long pushDataToLongMethod(
        intptr_t bindings_handle,
        ByteArray value,
        const char *name
);

void pushDataAndLongToVoidMethod(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle,
        const char *name
);

long pushDataAndLongToLongMethod(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle,
        const char *name
);

#endif //PROTONDRIVE_GLOBAL_H
