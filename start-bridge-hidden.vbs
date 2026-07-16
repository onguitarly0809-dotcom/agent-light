' agent-light 串口桥开机自启：隐藏窗口运行 bridge-autostart.bat
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""C:\Users\USER\Downloads\agent-light-main\bridge-autostart.bat""", 0, False
