import Cocoa
import ApplicationServices
struct Request:Decodable{let title:String;let expectedUser:String;let prompt:String;let action:String?;let optionTitle:String?;let questionText:String?}
func fail(_ message:String)->Never{FileHandle.standardError.write(Data(message.utf8));exit(1)}
guard AXIsProcessTrusted() else{fail("需要为 OPC 启用系统辅助功能权限，才能操作 WorkBuddy 原窗口")}
guard let request=try? JSONDecoder().decode(Request.self,from:FileHandle.standardInput.readDataToEndOfFile()),!request.expectedUser.isEmpty,!request.prompt.isEmpty else{fail("缺少可核验的对话内容")}
guard let app=NSWorkspace.shared.runningApplications.first(where:{$0.localizedName=="WorkBuddy"}) else{fail("WorkBuddy 尚未启动")}
let root=AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetAttributeValue(root,"AXManualAccessibility" as CFString,kCFBooleanTrue)
func attr(_ e:AXUIElement,_ key:String)->CFTypeRef?{var value:CFTypeRef?;AXUIElementCopyAttributeValue(e,key as CFString,&value);return value}
func scan(_ e:AXUIElement,_ depth:Int=0)->[AXUIElement]{if depth>40{return []};let role=attr(e,kAXRoleAttribute) as? String ?? "";if ["AXMenuBar","AXSecureTextField"].contains(role){return []};return [e]+(attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? []).flatMap{scan($0,depth+1)}}
func value(_ e:AXUIElement)->String{attr(e,kAXValueAttribute) as? String ?? ""}
func normalize(_ s:String)->String{s.replacingOccurrences(of:"\u{FEFF}",with:"").trimmingCharacters(in:.whitespacesAndNewlines)}
var editor:AXUIElement?
var verifiedContext=false
for _ in 0..<80{
 let nodes=scan(root);let texts=nodes.filter{attr($0,kAXRoleAttribute) as? String=="AXStaticText"}.map{value($0)}
 let areas=nodes.filter{attr($0,kAXRoleAttribute) as? String=="AXTextArea"}
 if texts.contains(request.title)&&texts.contains(where:{$0.contains(request.expectedUser)})&&(["stop","answer"].contains(request.action ?? "")||areas.count==1){verifiedContext=true;editor=areas.first;break}
 RunLoop.current.run(until:Date(timeIntervalSinceNow:0.15))
}
guard verifiedContext else{fail("无法核验 WorkBuddy 当前对话与所选记录一致，未发送")}
if request.action=="answer"{
 guard let option=request.optionTitle,let question=request.questionText,!question.isEmpty,scan(root).contains(where:{value($0)==question}) else{fail("当前提问已变化，未提交回答")}
 let buttons=scan(root).filter{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXTitleAttribute) as? String==option}
 guard buttons.count==1,attr(buttons[0],kAXEnabledAttribute) as? Bool==true else{fail("未找到唯一匹配的回答选项")}
 guard AXUIElementPerformAction(buttons[0],kAXPressAction as CFString) == .success else{fail("未能选择回答")}
 RunLoop.current.run(until:Date(timeIntervalSinceNow:0.3))
 if scan(root).contains(where:{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXTitleAttribute) as? String==option}) {
  guard let send=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXHelpAttribute) as? String=="发送"}),attr(send,kAXEnabledAttribute) as? Bool==true else{fail("回答发送按钮不可用，未自动重试")}
  guard AXUIElementPerformAction(send,kAXPressAction as CFString) == .success else{fail("回答发送失败")}
 }
 print("{\"answerSubmitted\":true}");exit(0)
}
if request.action=="stop"{
 guard let button=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXHelpAttribute) as? String=="停止"}),attr(button,kAXEnabledAttribute) as? Bool==true else{fail("WorkBuddy 当前没有可停止的执行")}
 guard AXUIElementPerformAction(button,kAXPressAction as CFString) == .success else{fail("未能点击 WorkBuddy 停止按钮")}
 RunLoop.current.run(until:Date(timeIntervalSinceNow:0.3));print("{\"stopRequested\":true}");exit(0)
}
guard let editor=editor else{fail("WorkBuddy 输入框不可用")}
if request.action=="create"{
 guard normalize(value(editor))==request.prompt else{fail("新任务草稿不匹配，未发送")}
 guard let send=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXHelpAttribute) as? String=="发送"}),attr(send,kAXEnabledAttribute) as? Bool==true else{fail("WorkBuddy 新任务发送按钮不可用")}
 guard AXUIElementPerformAction(send,kAXPressAction as CFString) == .success else{fail("新任务发送失败")}
 RunLoop.current.run(until:Date(timeIntervalSinceNow:0.3));print("{\"submittedToWindow\":true}");exit(0)
}
let draft=normalize(value(editor))
if !draft.isEmpty && draft != "今天帮你做些什么？ @ 引用对话文件，/ 调用技能与指令"{fail("WorkBuddy 输入框已有草稿，请先处理草稿；未覆盖或发送")}
app.activate()
AXUIElementPerformAction(editor,kAXPressAction as CFString)
AXUIElementSetAttributeValue(editor,kAXFocusedAttribute as CFString,kCFBooleanTrue)
usleep(300000)
guard NSWorkspace.shared.frontmostApplication?.processIdentifier==app.processIdentifier else{fail("WorkBuddy 不在前台，未输入")}
let board=NSPasteboard.general
let backup=board.pasteboardItems?.map{item in item.types.compactMap{type -> (NSPasteboard.PasteboardType,Data)? in guard let data=item.data(forType:type) else{return nil};return(type,data)}} ?? []
board.clearContents();board.setString(request.prompt,forType:.string);let version=board.changeCount
defer{if board.changeCount==version{board.clearContents();let items=backup.map{data in let item=NSPasteboardItem();for(type,bytes) in data{item.setData(bytes,forType:type)};return item};board.writeObjects(items)}}
func all(_ e:AXUIElement,_ depth:Int=0)->[AXUIElement]{if depth>12{return []};return [e]+(attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? []).flatMap{all($0,depth+1)}}
guard let paste=all(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXMenuItem" && attr($0,kAXTitleAttribute) as? String=="粘贴"}) else{fail("WorkBuddy 粘贴菜单不可用")}
guard AXUIElementPerformAction(paste,kAXPressAction as CFString) == .success else{fail("WorkBuddy 粘贴操作失败")}

for _ in 0..<40{RunLoop.current.run(until:Date(timeIntervalSinceNow:0.1));if let current=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXTextArea"}),normalize(value(current))==request.prompt{break}}
guard let current=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXTextArea"}),normalize(value(current))==request.prompt else{fail("正常粘贴内容核验失败，未发送")}
guard let send=scan(root).first(where:{attr($0,kAXRoleAttribute) as? String=="AXButton" && attr($0,kAXHelpAttribute) as? String=="发送"}), attr(send,kAXEnabledAttribute) as? Bool==true else{fail("WorkBuddy 发送按钮尚不可用；已保留草稿")}
guard AXUIElementPerformAction(send,kAXPressAction as CFString) == .success else{fail("无法点击 WorkBuddy 发送按钮")}

print("{\"submittedToWindow\":true}")
