#include <string.h>
#include <jni.h>
#include <android/log.h>
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
        jclass clazz,
        jlong sdk_handle,
        jbyteArray response
) {
    jbyte *bufferElems = (*env)->GetByteArrayElements(env, response, 0);
    ByteArray byteArray;
    byteArray.pointer = (const uint8_t *) bufferElems;
    byteArray.length = (*env)->GetArrayLength(env, response);

    proton_sdk_handle_response(
            (intptr_t) sdk_handle,
            byteArray
    );

    (*env)->ReleaseByteArrayElements(env, response, bufferElems, 0);
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

long onSendHttpRequest(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    return pushDataAndLongToLongMethod(bindings_handle, value, sdk_handle, "onSendHttpRequest");
}

void onHttpCancellation(
        intptr_t bindings_operation_handle
) {
    if (bindings_operation_handle == 0) {
        return;
    }
    JNIEnv *env = getJNIEnv();
    jobject obj = (*env)->NewLocalRef(env, (jweak) bindings_operation_handle);
    if ((*env)->IsSameObject(env, obj, NULL)) {
        __android_log_print(
                ANDROID_LOG_FATAL,
                "drive.sdk.internal",
                "Object was recycled for: %s %ld", "cancel", bindings_operation_handle
        );
        return;
    } else {
        jclass jobClass = (*env)->GetObjectClass(env, obj);
        jmethodID mid = (*env)->GetMethodID(env, jobClass, "cancel", "()V");
        if (mid == 0) {
            __android_log_print(
                    ANDROID_LOG_FATAL,
                    "drive.sdk.internal",
                    "Cannot found method: %s", "cancel"
            );
            return;
        }
        (*env)->CallVoidMethod(env, obj, mid);
    }
}

void onHttpResponseRead(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onHttpResponseRead");
}

void onAccountRequest(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t sdk_handle
) {
    pushDataAndLongToVoidMethod(bindings_handle, value, sdk_handle, "onAccountRequest");
}

void onRecordMetric(
        intptr_t bindings_handle,
        ByteArray value
) {
    pushDataToVoidMethod(bindings_handle, value, "onRecordMetric");
}

long onFeatureEnabled(
        intptr_t bindings_handle,
        ByteArray value
) {
    return pushDataToLongMethod(bindings_handle, value, "onFeatureEnabled");
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getReadPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onRead;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getWritePointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onWrite;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getProgressPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onProgress;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getHttpClientRequestPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onSendHttpRequest;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getHttpClientCancellationPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onHttpCancellation;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getHttpResponseReadPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onHttpResponseRead;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getAccountRequestPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onAccountRequest;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getRecordMetricPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onRecordMetric;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_getFeatureEnabledPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onFeatureEnabled;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_createWeakRef(JNIEnv* env, jobject obj) {
    jweak weakRef = (*env)->NewWeakGlobalRef(env, obj);
    return (jlong)(intptr_t) weakRef;
}

jlong Java_me_proton_drive_sdk_internal_ProtonDriveSdkNativeClient_createJobWeakRef(JNIEnv* env, jclass clazz, jobject obj) {
    jweak weakRef = (*env)->NewWeakGlobalRef(env, obj);
    return (jlong)(intptr_t) weakRef;
}
