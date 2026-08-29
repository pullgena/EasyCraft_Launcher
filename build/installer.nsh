; EasyCraft Launcher uninstall cleanup
; IMPORTANT: do not delete user data during an automatic app update.
; Only remove EasyCraft's own roaming folders during a real uninstall.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\EasyCraft Launcher"
    RMDir /r "$APPDATA\easycraft-launcher"
    RMDir /r "$APPDATA\EasyCraftLauncher"
  ${endIf}
!macroend
