LOCAL_PATH := $(call my-dir)
BUILD_DIR := $(BUILD_DIR)

include $(CLEAR_VARS)
LOCAL_MODULE := proton_drive_sdk
LOCAL_SRC_FILES := $(BUILD_DIR)/cs/jni/$(TARGET_ARCH_ABI)/libproton_drive_sdk.so
LOCAL_EXPORT_C_INCLUDES := $(BUILD_DIR)/cs/includes
include $(PREBUILT_SHARED_LIBRARY)

include $(CLEAR_VARS)
LOCAL_MODULE    := proton_drive_sdk_jni
LOCAL_SRC_FILES := global.c byte_array.c buffer.c job.c native_library.c proton_drive_sdk.c proton_sdk.c
LOCAL_SHARED_LIBRARIES := proton_drive_sdk
LOCAL_C_INCLUDES += $(BUILD_DIR)/cs/includes
LOCAL_LDLIBS := -llog
include $(BUILD_SHARED_LIBRARY)
