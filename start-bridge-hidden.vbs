' agent-light 串口桥开机自启：隐藏窗口运行 bridge-autostart.bat
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""E:\agent-light-main\bridge-autostart.bat""", 0, False
