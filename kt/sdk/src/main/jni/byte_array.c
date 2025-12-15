#include <string.h>
#include <jni.h>
#include <malloc.h>

jlong Java_me_proton_drive_sdk_internal_JniByteArray_getByteArray(
        JNIEnv *env,
        jclass clazz,
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

void Java_me_proton_drive_sdk_internal_JniByteArray_releaseByteArray(
        JNIEnv *env,
        jclass clazz,
        jlong ptr
) {
    if (ptr != 0) {
        free((void *) ptr);
    }
}
