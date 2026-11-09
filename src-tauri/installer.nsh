; Lumen Viewer installer hooks (included by Tauri's NSIS template).
;
; Tauri already registers the per-extension ProgIDs and OpenWithProgids from
; bundle.fileAssociations. These hooks add the "registered application"
; entries so Lumen Viewer is listed in Settings > Default apps, then offer to
; open that page so the user can make it the default viewer.
;
; SHCTX follows the install mode: HKLM for "all users", HKCU for "just me".

!define LUMEN_APP_KEY "Software\Lumen Viewer"
!define LUMEN_CAPS_KEY "Software\Lumen Viewer\Capabilities"
!define LUMEN_APPLICATIONS_KEY "Software\Classes\Applications\${MAINBINARYNAME}.exe"

!macro LUMEN_REGISTER_EXT EXT PROGID
  WriteRegStr SHCTX "${LUMEN_CAPS_KEY}\FileAssociations" ".${EXT}" "${PROGID}"
  WriteRegStr SHCTX "${LUMEN_APPLICATIONS_KEY}\SupportedTypes" ".${EXT}" ""
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; "Open with" entry for the app itself.
  WriteRegStr SHCTX "${LUMEN_APPLICATIONS_KEY}" "FriendlyAppName" "Lumen Viewer"
  WriteRegStr SHCTX "${LUMEN_APPLICATIONS_KEY}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "${LUMEN_APPLICATIONS_KEY}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Capabilities, used by Settings > Default apps.
  WriteRegStr SHCTX "${LUMEN_CAPS_KEY}" "ApplicationName" "Lumen Viewer"
  WriteRegStr SHCTX "${LUMEN_CAPS_KEY}" "ApplicationDescription" "A fast, transparent photo viewer."
  WriteRegStr SHCTX "${LUMEN_CAPS_KEY}" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"

  !insertmacro LUMEN_REGISTER_EXT "jpg" "LumenViewer.JPEG"
  !insertmacro LUMEN_REGISTER_EXT "jpeg" "LumenViewer.JPEG"
  !insertmacro LUMEN_REGISTER_EXT "jfif" "LumenViewer.JPEG"
  !insertmacro LUMEN_REGISTER_EXT "png" "LumenViewer.PNG"
  !insertmacro LUMEN_REGISTER_EXT "gif" "LumenViewer.GIF"
  !insertmacro LUMEN_REGISTER_EXT "bmp" "LumenViewer.BMP"
  !insertmacro LUMEN_REGISTER_EXT "webp" "LumenViewer.WEBP"
  !insertmacro LUMEN_REGISTER_EXT "tif" "LumenViewer.TIFF"
  !insertmacro LUMEN_REGISTER_EXT "tiff" "LumenViewer.TIFF"
  !insertmacro LUMEN_REGISTER_EXT "ico" "LumenViewer.ICO"

  WriteRegStr SHCTX "Software\RegisteredApplications" "Lumen Viewer" "${LUMEN_CAPS_KEY}"

  ; Tell Explorer that file associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ; Offer to make Lumen the default (skipped for silent installs/updates).
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Make Lumen Viewer your default image viewer?$\r$\n$\r$\nWindows will open its Default apps settings on Lumen Viewer. Click $\"Set default$\" there to finish." IDNO lumen_skip_default
      ReadRegStr $0 HKLM "Software\RegisteredApplications" "Lumen Viewer"
      ${If} $0 != ""
        ExecShell "open" "ms-settings:defaultapps?registeredAppMachine=Lumen%20Viewer"
      ${Else}
        ExecShell "open" "ms-settings:defaultapps?registeredAppUser=Lumen%20Viewer"
      ${EndIf}
    lumen_skip_default:
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Lumen Viewer"
  DeleteRegKey SHCTX "${LUMEN_APP_KEY}"
  DeleteRegKey SHCTX "${LUMEN_APPLICATIONS_KEY}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
