!macro customInstall
  ; Show Royale Launcher in Windows "Open with" for generic ZIP modpacks
  ; without taking over the user's normal .zip association.
  WriteRegStr HKCU "Software\Classes\Applications\Royale Launcher.exe" "FriendlyAppName" "Royale Launcher"
  WriteRegStr HKCU "Software\Classes\Applications\Royale Launcher.exe\shell\open\command" "" '"$INSTDIR\Royale Launcher.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\Royale Launcher.exe\SupportedTypes" ".zip" ""
  WriteRegStr HKCU "Software\Classes\Applications\Royale Launcher.exe\SupportedTypes" ".mrpack" ""
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\Royale Launcher.exe"
!macroend
