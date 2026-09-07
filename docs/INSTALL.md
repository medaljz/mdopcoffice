# OPC 安装与使用说明

适用于 2026-09-07 分享包。OPC 是可修改源码的本地办公室窗口，连接当前电脑自己的 Agent。网页与独立 app/exe 使用同一套源码及本地数据，不是分享者的远程窗口。

## 一、先准备什么

| 项目 | 要求 |
|---|---|
| 基础运行 | Node.js 24 或更新版本 |
| Agent | 本机安装并登录 WorkBuddy 或 Codex，使用自己的账号 |
| 网页方式 | 浏览器即可，基础运行不需要 npm install |
| macOS 独立 app | 额外需要 Xcode Command Line Tools |
| Windows 独立 exe | 系统 Windows PowerShell 和 Edge 或 Chrome |
| 字体 | 已随包提供，无需安装或联网下载 |

Windows WorkBuddy 已有用户实机试用正常的反馈。Windows Codex 桌面任务同步当前不支持；新增彩蛋搜集、exe 和伴随启动仍需逐项本机确认。macOS 双 Agent 任务链路已在发布者电脑验证。

## 二、推荐：让你的 Agent 安装

1. 下载 OPC-share.zip，用系统解压工具完整解压。
2. 放到固定、可写的目录，例如 Windows 的 D:\Apps\OPC-share，或 macOS 的 ~/Applications/OPC-share。不要从压缩包里直接运行。
3. 在本地 Agent 中打开此文件夹，或把完整目录告诉它。
4. 发送下面的提示词。首次登录、系统授权等交互由你本人完成。

```text
请在我的电脑安装这个 OPC 分享包。先阅读 docs/INSTALL.md、docs/AGENT-INSTALL.md、docs/ASSETS.md 和 docs/RELEASE-STATUS.md。
请一次性询问：我的公司叫什么 OPC；使用网页还是独立 app/exe；绑定 Codex、WorkBuddy 还是两者；是否随所选 Agent 启动自动打开。
选择确认后直接完成依赖检查、部署、绑定和验证，不反复确认常规步骤。使用我的本机账号，保留已有其他配置。需要登录或系统权限时告诉我。
使用 --company 设置我的名字，保持现有招牌字体、场景和人物，保留可修改源码。
实际验证打开窗口、发布测试任务、Agent 回复、员工任务状态和手动延续对话。选择双 Agent 时分别验证；选择伴随启动时验证相应打开方式。不要中断现有任务。
检查闲时彩蛋可以接话、连续点击不重复，并说明自动搜集会使用 Agent 用量及暂停入口。
最后返回安装目录、打开入口、使用方法和通过/未通过项。不要把页面打开当成绑定成功。
```

## 三、手动安装命令

以下命令在解压目录内运行；先确认该目录有 package.json 和 scripts 文件夹。

检查 Node：

```sh
node --version
```

缺少或低于 v24 时，从 https://nodejs.org/en/download 安装对应系统版本，重新打开终端再检查。macOS 独立 app 缺少编译工具时运行 `xcode-select --install`，等待系统安装完成。

Windows + WorkBuddy + 网页：

```sh
node scripts/deploy.mjs --mode web --bind workbuddy --autostart agent --company "小林"
```

Windows + WorkBuddy + 独立 exe：

```sh
node scripts/deploy.mjs --mode app --bind workbuddy --autostart agent --company "小林"
```

macOS + Codex/WorkBuddy 双 Agent + 独立 app：

```sh
node scripts/deploy.mjs --mode app --bind codex,workbuddy --autostart agent --company "小林"
```

macOS + Codex + 网页：

```sh
node scripts/deploy.mjs --mode web --bind codex --autostart agent --company "小林"
```

参数说明：`--mode web` 是网页，`--mode app` 是独立窗口；`--bind` 选择 Agent；`--autostart off` 关闭伴随启动；`--company "小林"` 显示“小林OPC”，已经带 OPC 不会重复添加。首次交互部署缺少名字会提问；Agent 非交互部署必须传入名字。

如默认 4317 端口被其他程序占用，加 `--port 4318` 等空闲端口。脚本会记录端口；用启动器打开，不要一直访问旧端口。加 `--dry-run` 可查看将使用的配置，不执行安装。

部署后，在 Agent 内刷新 MCP 或重启 Agent，检查 opc_status 可用。不要强制关闭正在做任务的 Agent。macOS 如提示辅助功能权限，在系统设置中授权对应应用。

## 四、以后怎么打开

- macOS：双击根目录“启动OPC.command”，或运行 `node scripts/launch.mjs`。
- Windows：双击根目录“启动OPC-Windows.cmd”，或运行 `node scripts/launch.mjs`。
- 临时换网页：`node scripts/launch.mjs --web`。
- 临时换独立窗口：`node scripts/launch.mjs --app`，需要先完成 app 模式部署。
- 生成的程序位于 dist/OPC.app 或 dist/OPC.exe。它依赖源码目录和 Node，请不要只把 app/exe 单独复制出去。

开启伴随启动后，监听器在当前用户环境中检测所选 Agent 的新进程并打开 OPC。它不是 Agent 内部的插件加载事件；关闭一次 OPC 不会对同一个 Agent 进程反复弹窗。Windows 登录启动项等行为需在本机确认。MCP 初始化也能启动后台服务，但不等同于一定弹出前台窗口。

## 五、怎么使用

1. 点击左上角公司名称，修改名字和说明；招牌字体、描边保持一致，长名字自动缩小。
2. 点击人物打开档案，可以修改姓名、形象或选择默认执行 Agent。
3. 点击“安排新任务”，选择 Agent 并填写需求。自动归属不准确时，点“延续对话 · 手动选择”，先选项目再选具体对话；消息只发到所选对话。
4. 查看员工状态、项目进度和原对话回复。批准或复杂提问可能仍需去 Agent 原窗口处理。
5. 点击空闲员工体验彩蛋，可接话或换话题。常驻段子不调用模型；自动搜集默认开启，在服务运行且空闲时约每 18～36 小时更新，会使用 Agent 用量。在人物档案“彩蛋更新”里暂停或手动刷新。

## 六、安装完成后的验收

让 Agent 在专门的测试目录创建一份小文本，再从 OPC 发布“读取这个文件并回复内容”的任务。确认任务进入正确原对话、员工显示执行状态、最终回复正确。手动延续时再发送一个依赖上一条内容的短请求，确认仍是同一对话。不要向真实客户或工作群发送测试消息。

网页、独立窗口、伴随启动、彩蛋联网更新分别验收。双 Agent 分别验证，不用一个成功代替另一个。账号或网络受限时，记录实际错误。

## 七、常见问题与更新

- 找不到 node：检查 Node 版本、重开终端，必要时让 Agent 检查 PATH。
- 找不到 WorkBuddy：检查是否安装、登录及实际 CLI 位置；非标准目录配置见 AGENT-INSTALL.md。
- MCP 同名绑定冲突：核对旧 opc-office 指向哪个目录，只迁移这一项，保留其他 MCP。
- 自动归属选错：用手动延续，不必靠反复修改需求让系统猜。
- 没有新彩蛋：查看“彩蛋更新”状态；忙碌会延后，联网失败保留旧库，六小时后重试。
- 改名失败或重部署提示已有名称：已有办公室直接在左上角修改；部署不会覆盖旧名称。
- 更换目录或 Node 路径：重新部署并核对 MCP 和伴随启动项指向新位置。
- 更新版本：先等任务结束，让 Agent 备份本机 .local，再停止旧服务、更新源码；不要覆盖或删除 .local。复核部署绑定和打开入口，再启动验收。

卸载前，在原目录运行 `node scripts/deploy.mjs --mode web --bind none --autostart off --no-open` 关闭伴随启动，再移除 Agent 内的 opc-office 绑定。让 Agent 停止该安装的后台服务。需要保留设置、账本、任务记录时，备份 .local 后再处理文件夹。

## 八、放到 GitHub 怎么分享

建议仓库存放干净分享目录中的源码、素材与文档；把 OPC-share.zip 上传到 Releases 作为下载附件。不要上传日常开发目录的 .local、账号配置、日志或 .git 历史。分享目录已附 .gitignore，安装后产生的本地数据会被忽略。

GitHub 普通网页文件上传限制为 25 MiB，Git 对超过 50 MiB 的文件提示警告；约 57 MB 的 ZIP 更适合 Releases。参见 https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github 。

当前包只有字体的 OFL 授权，尚未附项目整体 LICENSE。正式开源需要由作者明确代码和场景素材的使用、修改、再分发权限；不要擅自把字体或全部素材标成 MIT。授权说明参见 https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository 。

GitHub 可以托管代码和下载包；现有 OPC 依赖本地 Node 服务和本机 Agent，不能仅上传到 GitHub Pages 就获得同样的任务功能。
