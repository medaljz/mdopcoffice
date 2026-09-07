using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
public static class Launcher {
 [STAThread] public static void Main() {
  try {
   string root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
   string node=File.ReadAllText(Path.Combine(root,".local","node-path.txt")).Trim();
   var p=new ProcessStartInfo(node,"\""+Path.Combine(root,"scripts","launch.mjs")+"\" --app");
   p.WorkingDirectory=root;p.UseShellExecute=false;p.CreateNoWindow=true;p.RedirectStandardError=true;
   using(var child=Process.Start(p)){string error=child.StandardError.ReadToEnd();child.WaitForExit();if(child.ExitCode!=0)MessageBox.Show(error,"OPC");}
  }catch(Exception e){MessageBox.Show(e.Message,"OPC");}
 }
}
