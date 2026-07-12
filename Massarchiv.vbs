' Startet Massarchiv komplett unsichtbar (kein schwarzes Konsolenfenster).
' Die Desktop-Verknuepfung zeigt auf: wscript.exe "<Pfad>\Massarchiv.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run """" & scriptDir & "\start_massarchiv.bat""", 0, False
