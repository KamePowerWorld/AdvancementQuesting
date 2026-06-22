param([string]$RunDir)

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ProcInfo {
    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(IntPtr h, int cls, ref PBI pbi, int sz, out int r);
    [StructLayout(LayoutKind.Sequential)]
    struct PBI { public IntPtr r1, Peb, r2, r3, Pid, r4; }
    [DllImport("kernel32.dll")]
    static extern bool ReadProcessMemory(IntPtr h, IntPtr a, byte[] b, int sz, out IntPtr r);
    public static string Cwd(int pid) {
        try {
            var h = System.Diagnostics.Process.GetProcessById(pid).Handle;
            var pbi = new PBI(); int r;
            NtQueryInformationProcess(h, 0, ref pbi, System.Runtime.InteropServices.Marshal.SizeOf(pbi), out r);
            var b = new byte[8]; IntPtr rd;
            ReadProcessMemory(h, IntPtr.Add(pbi.Peb, 0x20), b, 8, out rd);
            var pa = (IntPtr)BitConverter.ToInt64(b, 0);
            var lb = new byte[4];
            ReadProcessMemory(h, IntPtr.Add(pa, 0x38), lb, 4, out rd);
            var len = BitConverter.ToUInt16(lb, 0);
            var pb = new byte[8];
            ReadProcessMemory(h, IntPtr.Add(pa, 0x40), pb, 8, out rd);
            var sa = (IntPtr)BitConverter.ToInt64(pb, 0);
            var sb = new byte[len];
            ReadProcessMemory(h, sa, sb, len, out rd);
            return Encoding.Unicode.GetString(sb);
        } catch { return ""; }
    }
}
'@
Add-Type -TypeDefinition $code

$target = $RunDir.TrimEnd('\').ToLower()
$killed = 0
Get-WmiObject Win32_Process -Filter "name='java.exe'" | ForEach-Object {
    $cwd = [ProcInfo]::Cwd($_.ProcessId).TrimEnd('\').ToLower()
    if ($cwd -eq $target) {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host "Killed PID $($_.ProcessId) (cwd: $cwd)"
        $killed++
    }
}
if ($killed -eq 0) { Write-Error "No java process found in $RunDir"; exit 1 }
exit 0
