' agent-light bridge autostart: run bridge-autostart.bat (same folder) in a hidden window.
' Locates its own folder at runtime, so the project works wherever you put it.
' NOTE: keep this file ASCII-only. VBScript reads files as ANSI (GBK) on Chinese
' Windows, and UTF-8 Chinese comments can swallow line breaks and break parsing.
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir
WshShell.Run "cmd /c """ & fso.BuildPath(dir, "bridge-autostart.bat") & """", 0, False
