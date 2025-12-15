#include <jni.h>
#include <android/log.h>
#include "global.h"

void onCancel(
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
                "Object was recycled for: %s %ld", "cancel", (long) bindings_operation_handle
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

jlong Java_me_proton_drive_sdk_internal_JniJob_getCancelPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onCancel;
}

jlong Java_me_proton_drive_sdk_internal_JniJob_createWeakRef(
        JNIEnv *env,
        jclass clazz,
        jobject obj
) {
    jweak weakRef = (*env)->NewWeakGlobalRef(env, obj);
    return (jlong)(intptr_t) weakRef;
}