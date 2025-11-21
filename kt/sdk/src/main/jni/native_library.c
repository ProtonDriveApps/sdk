#include <string.h>
#include <jni.h>
#include <android/log.h>
#include "proton_drive_sdk.h"
#include "global.h"

void Java_me_proton_drive_sdk_internal_JniNativeLibrary_overrideName(
        JNIEnv *env,
        jobject obj,
        jbyteArray name,
        jbyteArray overridingName
) {
    ByteArray nameByteArray;
    jbyte *nameBufferElems = (*env)->GetByteArrayElements(env, name, 0);
    nameByteArray.pointer = (const uint8_t *) nameBufferElems;
    nameByteArray.length = (*env)->GetArrayLength(env, name);

    ByteArray overridingNameByteArray;
    jbyte *overridingNameBufferElems = (*env)->GetByteArrayElements(env, overridingName, 0);
    overridingNameByteArray.pointer = (const uint8_t *) overridingNameBufferElems;
    overridingNameByteArray.length = (*env)->GetArrayLength(env, overridingName);

    override_native_library_name(
            nameByteArray,
            overridingNameByteArray
    );
    (*env)->ReleaseByteArrayElements(env, name, nameBufferElems, 0);
    (*env)->ReleaseByteArrayElements(env, overridingName, overridingNameBufferElems, 0);
}
