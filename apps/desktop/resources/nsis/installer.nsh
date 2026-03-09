!macro customHeader
  !system "echo '' > /dev/null"
!macroend

!macro customInit
  ; Check for Visual C++ Redistributable
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Version"
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION "Visual C++ Redistributable 2015-2022 is required. Install it now?" IDYES installVCRedist IDNO skipVCRedist
    installVCRedist:
      ExecShell "open" "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    skipVCRedist:
  ${EndIf}
!macroend

!macro customInstall
  ; Register file associations
  WriteRegStr HKCR ".avidproj" "" "TheAvid.Project"
  WriteRegStr HKCR "TheAvid.Project" "" "The Avid Project File"
  WriteRegStr HKCR "TheAvid.Project\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "TheAvid.Project\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR ".avidproj"
  DeleteRegKey HKCR "TheAvid.Project"
!macroend
