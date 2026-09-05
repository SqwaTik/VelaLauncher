!macro customInstall
  ; Show Vela Launcher in Windows "Open with" for generic ZIP modpacks
  ; without taking over the user's normal .zip association.
  WriteRegStr HKCU "Software\Classes\Applications\Vela Launcher.exe" "FriendlyAppName" "Vela Launcher"
  WriteRegStr HKCU "Software\Classes\Applications\Vela Launcher.exe\shell\open\command" "" '"$INSTDIR\Vela Launcher.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\Vela Launcher.exe\SupportedTypes" ".zip" ""
  WriteRegStr HKCU "Software\Classes\Applications\Vela Launcher.exe\SupportedTypes" ".mrpack" ""
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\Vela Launcher.exe"
!macroend
