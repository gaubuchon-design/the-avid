# =============================================================================
#  THE AVID — Native Codec Build (CMake)
#  Cross-platform build for the N-API addon wrapping FFmpeg, LibRaw, OpenEXR.
#
#  Build:
#    cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
#    cmake --build build
#
#  Or via npm:
#    npm run build:native
# =============================================================================

cmake_minimum_required(VERSION 3.15)
project(avid_native_codecs C)

# ── Node.js N-API ────────────────────────────────────────────────────────────

# cmake-js sets these variables
include_directories(${CMAKE_JS_INC})

# ── Find Dependencies ────────────────────────────────────────────────────────

# FFmpeg libraries (via pkg-config)
find_package(PkgConfig REQUIRED)
pkg_check_modules(AVCODEC REQUIRED libavcodec)
pkg_check_modules(AVFORMAT REQUIRED libavformat)
pkg_check_modules(AVUTIL REQUIRED libavutil)
pkg_check_modules(SWSCALE REQUIRED libswscale)
pkg_check_modules(SWRESAMPLE REQUIRED libswresample)

# LibRaw
pkg_check_modules(LIBRAW REQUIRED libraw)

# OpenEXR (optional — for direct EXR operations beyond FFmpeg)
pkg_check_modules(OPENEXR QUIET OpenEXR)

# ImageMagick (optional — for additional image format support)
pkg_check_modules(MAGICK QUIET MagickCore)

# ── Compile Options ──────────────────────────────────────────────────────────

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Warnings
if(MSVC)
    add_compile_options(/W3)
else()
    add_compile_options(-Wall -Wextra -Wno-unused-parameter -O2)
endif()

# Platform-specific
if(APPLE)
    add_compile_definitions(AVID_PLATFORM_MACOS)
    # Enable VideoToolbox support
    find_library(VIDEOTOOLBOX VideoToolbox)
    find_library(COREMEDIA CoreMedia)
    find_library(COREVIDEO CoreVideo)
    find_library(METAL Metal)
    find_library(METALKIT MetalKit)
elseif(WIN32)
    add_compile_definitions(AVID_PLATFORM_WINDOWS)
elseif(UNIX)
    add_compile_definitions(AVID_PLATFORM_LINUX)
endif()

# ── Source Files ─────────────────────────────────────────────────────────────

set(SOURCES
    src/avid_codecs.c
    src/napi_binding.c
)

# ── Build Shared Library (.node) ─────────────────────────────────────────────

add_library(${PROJECT_NAME} SHARED ${SOURCES})

# N-API target properties
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    # N-API version 8 (stable across Node.js versions)
    COMPILE_DEFINITIONS "NAPI_VERSION=8"
)

# ── Include Directories ──────────────────────────────────────────────────────

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_JS_INC}
    ${AVCODEC_INCLUDE_DIRS}
    ${AVFORMAT_INCLUDE_DIRS}
    ${AVUTIL_INCLUDE_DIRS}
    ${SWSCALE_INCLUDE_DIRS}
    ${SWRESAMPLE_INCLUDE_DIRS}
    ${LIBRAW_INCLUDE_DIRS}
)

if(OPENEXR_FOUND)
    target_include_directories(${PROJECT_NAME} PRIVATE ${OPENEXR_INCLUDE_DIRS})
    target_compile_definitions(${PROJECT_NAME} PRIVATE AVID_HAS_OPENEXR)
endif()

if(MAGICK_FOUND)
    target_include_directories(${PROJECT_NAME} PRIVATE ${MAGICK_INCLUDE_DIRS})
    target_compile_definitions(${PROJECT_NAME} PRIVATE AVID_HAS_IMAGEMAGICK)
endif()

# ── Link Libraries ───────────────────────────────────────────────────────────

target_link_libraries(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_LIB}
    ${AVCODEC_LIBRARIES}
    ${AVFORMAT_LIBRARIES}
    ${AVUTIL_LIBRARIES}
    ${SWSCALE_LIBRARIES}
    ${SWRESAMPLE_LIBRARIES}
    ${LIBRAW_LIBRARIES}
)

if(OPENEXR_FOUND)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${OPENEXR_LIBRARIES})
endif()

if(MAGICK_FOUND)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${MAGICK_LIBRARIES})
endif()

# Platform frameworks
if(APPLE)
    target_link_libraries(${PROJECT_NAME} PRIVATE
        ${VIDEOTOOLBOX}
        ${COREMEDIA}
        ${COREVIDEO}
    )
    if(METAL)
        target_link_libraries(${PROJECT_NAME} PRIVATE ${METAL} ${METALKIT})
    endif()
endif()

# ── Library Search Paths ─────────────────────────────────────────────────────

target_link_directories(${PROJECT_NAME} PRIVATE
    ${AVCODEC_LIBRARY_DIRS}
    ${AVFORMAT_LIBRARY_DIRS}
    ${AVUTIL_LIBRARY_DIRS}
    ${SWSCALE_LIBRARY_DIRS}
    ${SWRESAMPLE_LIBRARY_DIRS}
    ${LIBRAW_LIBRARY_DIRS}
)

# ── Install ──────────────────────────────────────────────────────────────────

# Install the .node file to the package prebuilds directory
install(TARGETS ${PROJECT_NAME}
    LIBRARY DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/../prebuilds/${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}
)
