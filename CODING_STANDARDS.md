# Coding Standards

## WME SDK contracts

Use the pinned `wme-sdk-typings` as the source of truth for WME SDK method arguments. Derive narrow application and fake-SDK types from those signatures or exported types instead of copying SDK payload shapes. Test the exact payload at the SDK boundary when its shape affects user-visible behavior.
