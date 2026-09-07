import Cocoa
import WebKit
import CryptoKit

class OfficeDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var received = ""
    var address: URL {
        let file = URL(fileURLWithPath: projectRoot + "/.local/deployment.json")
        let config = (try? Data(contentsOf: file)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let port = config?["port"] as? Int ?? 4317
        return URL(string: "http://127.0.0.1:\(port)")!
    }
    var projectRoot: String {
        guard let url = Bundle.main.url(forResource: "project-root", withExtension: "txt"),
              let value = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        let root = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if root.hasPrefix("/") { return root }
        return Bundle.main.bundleURL.appendingPathComponent(root).standardized.path
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        let top = NSMenuItem(title: "窗口置顶", action: #selector(toggleTop(_:)), keyEquivalent: "t"); top.target = self; appMenu.addItem(top)
        let reload = NSMenuItem(title: "刷新办公室", action: #selector(reloadPage), keyEquivalent: "r"); reload.target = self; appMenu.addItem(reload)
        let show = NSMenuItem(title: "打开产物目录", action: #selector(showProjects), keyEquivalent: "o"); show.target = self; appMenu.addItem(show)
        appMenu.addItem(.separator()); appMenu.addItem(withTitle: "退出 OPC", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); editItem.title = "编辑"; menu.addItem(editItem)
        let editMenu = NSMenu(title: "编辑"); editItem.submenu = editMenu
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] { editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1420, height: 950), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "OPC"; window.minSize = NSSize(width: 1024, height: 740); window.setFrameAutosaveName("OnePCOfficeWindow")
        web = WKWebView(frame: .zero); web.navigationDelegate = self; web.uiDelegate = self; window.contentView = web
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString("<body style='background:#f5f5ef;color:#687c55;font:18px -apple-system;display:grid;place-items:center;height:90vh'>正在打开 OPC…</body>", baseURL: nil)
        var request = URLRequest(url: address.appendingPathComponent("health")); request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { data, _, _ in
            DispatchQueue.main.async {
                if let data = data, let health = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], health["app"] as? String == "one-pc-office" {
                    let root = URL(fileURLWithPath: self.projectRoot).resolvingSymlinksInPath().path
                    let expected = SHA256.hash(data: Data(root.utf8)).map { String(format: "%02x", $0) }.joined()
                    if health["installationId"] as? String == expected { self.web.load(URLRequest(url: self.address)) }
                    else { self.showError("该端口已被另一份或旧版 OPC 占用，请重新部署到其他端口，或先更新原服务。") }
                }
                else { self.startService() }
            }
        }.resume()
    }
    func startService() {
        let savedNode = (try? String(contentsOfFile: projectRoot + "/.local/node-path.txt", encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        let node = [savedNode, ProcessInfo.processInfo.environment["OPC_NODE"], "/opt/homebrew/bin/node", "/usr/local/bin/node"].compactMap { $0 }.first { FileManager.default.isExecutableFile(atPath: $0) } ?? "/usr/local/bin/node"
        let p = Process(); p.executableURL = URL(fileURLWithPath: node); p.arguments = [projectRoot + "/server.mjs"]
        p.currentDirectoryURL = URL(fileURLWithPath: projectRoot)
        var env = ProcessInfo.processInfo.environment; env["ONE_PC_PORT"] = String(address.port ?? 4317); p.environment = env
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = Pipe()
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                self.received += line
                if self.received.contains("ONE_PC_READY") { handle.readabilityHandler = nil; self.web.load(URLRequest(url: self.address)) }
            }
        }
        p.terminationHandler = { _ in DispatchQueue.main.async { if self.received.isEmpty { self.showError("本地服务未启动。请检查 Node.js 和项目目录是否可用。") } } }
        do { try p.run(); service = p } catch { showError(error.localizedDescription) }
    }
    func showError(_ text: String) { let alert = NSAlert(); alert.messageText = "办公室启动遇到问题"; alert.informativeText = text; alert.runModal() }
    @objc func toggleTop(_ sender: NSMenuItem) { let pinned = window.level == .normal; window.level = pinned ? .floating : .normal; sender.state = pinned ? .on : .off }
    @objc func reloadPage() { web.reload() }
    @objc func showProjects() { let url = URL(fileURLWithPath: projectRoot + "/.local/projects"); try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true); NSWorkspace.shared.open(url) }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        decisionHandler(url.host == "127.0.0.1" || url.scheme == "about" ? .allow : .cancel)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { if service?.isRunning == true { service?.terminate() } }
}
let app = NSApplication.shared
let delegate = OfficeDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
