#include <string.h>
#include <jni.h>
#include <android/log.h>
#include <malloc.h>
#include "proton_drive_sdk.h"
#include "global.h"

void onDriveSdkResponse(intptr_t bindings_handle, ByteArray value) {
    pushDataToVoidMethod(bindings_handle, value, "onResponse");
}

void Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_handleRequest(
        JNIEnv *env,
        jobject obj,
        jbyteArray request
) {
    jbyte *bufferElems = (*env)->GetByteArrayElements(env, request, 0);
    ByteArray byteArray;
    byteArray.pointer = (const uint8_t *) bufferElems;
    byteArray.length = (*env)->GetArrayLength(env, request);
    intptr_t weakObjRef = (intptr_t) (*env)->NewWeakGlobalRef(env, obj);

    proton_drive_sdk_handle_request(
            byteArray,
            weakObjRef,
            onDriveSdkResponse
    );

    (*env)->ReleaseByteArrayElements(env, request, bufferElems, 0);
}

void Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_handleResponse(
        JNIEnv *env,
        jobject obj,
        jlong sdk_handle,
        jbyteArray response
) {
    jbyte *bufferElems = (*env)->GetByteArrayElements(env, response, 0);
    ByteArray byteArray;
    byteArray.pointer = (const uint8_t *) bufferElems;
    byteArray.length = (*env)->GetArrayLength(env, response);

    proton_drive_sdk_handle_response(
            (intptr_t) sdk_handle,
            byteArray
    );

    (*env)->ReleaseByteArrayElements(env, response, bufferElems, 0);
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getByteArray(
        JNIEnv *env,
        jobject obj,
        jbyteArray array
) {
    jsize length = (*env)->GetArrayLength(env, array);
    jbyte *data = (*env)->GetByteArrayElements(env, array, NULL);

    // Allocate native memory
    jbyte *buffer = (jbyte *) malloc(length);
    if (buffer == NULL) {
        (*env)->ReleaseByteArrayElements(env, array, data, JNI_ABORT);
        return 0; // OOM
    }

    // Copy into native memory
    memcpy(buffer, data, length);

    (*env)->ReleaseByteArrayElements(env, array, data, JNI_ABORT);

    // Return as jlong handle
    return (jlong) buffer;
}

void Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_releaseByteArray(
        JNIEnv *env,
        jobject obj,
        jlong ptr
) {
    if (ptr != 0) {
        free((void *) ptr);
    }
}


void onRead(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onRead");
}

void onWrite(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onWrite");
}

void onProgress(intptr_t bindings_handle, ByteArray value) {
    pushDataToVoidMethod(bindings_handle, value, "onProgress");
}

void onSendHttpRequest(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onSendHttpRequest");
}

void onRequest(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onRequest");
}

void onRecordMetric(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataToVoidMethod(bindings_handle, value, "onRecordMetric");
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getReadPointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onRead;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getWritePointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onWrite;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getProgressPointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onProgress;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getSendHttpRequestPointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onSendHttpRequest;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getRequestPointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onRequest;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getRecordMetricPointer(
        JNIEnv *env,
        jobject obj
) {
    return (jlong) (intptr_t) &onRecordMetric;
}
