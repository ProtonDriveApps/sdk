#include <string.h>
#include <jni.h>
#include <android/log.h>
#include "proton_drive_sdk.h"
#include "global.h"

void onSdkResponse(intptr_t bindings_handle, ByteArray value) {
    pushDataToVoidMethod(bindings_handle, value, "onResponse");
}

void Java_me_proton_drive_sdk_internal_ProtonSdkNativeClient_handleRequest(
        JNIEnv *env,
        jclass clazz,
        jlong ref,
        jbyteArray request
) {
    jbyte *bufferElems = (*env)->GetByteArrayElements(env, request, 0);
    ByteArray byteArray;
    byteArray.pointer = (const uint8_t *) bufferElems;
    byteArray.length = (*env)->GetArrayLength(env, request);

    proton_sdk_handle_request(
            byteArray,
            (intptr_t) ref,
            onSdkResponse
    );

    (*env)->ReleaseByteArrayElements(env, request, bufferElems, 0);
}

void onCallback(intptr_t bindings_handle, ByteArray value) {
    pushDataToVoidMethod(bindings_handle, value, "onCallback");
}

jlong Java_me_proton_drive_sdk_internal_ProtonSdkNativeClient_getCallbackPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onCallback;
}
