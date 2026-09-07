# 给安装 Agent 的执行说明

你正在为当前电脑的用户安装可修改源码的 OPC。先读取本文件、share-guide.md 和 ASSETS.md。场景必须使用现有完整页面，不得把某张底图当成最终素材自行重建。不要使用分享者的账号、历史、绝对路径或任务链接。包内不含这些数据。

## 先取得一次选择

仅询问尚未提供的选项：
1. 显示方式：网页 web，或独立窗口 app。
2. 绑定：Codex、WorkBuddy，或两者。
3. 公司叫什么 OPC（用户提供简称即可，例如“小林”→“小林OPC”；保留用户自己的名称）。
4. 是否随所选 Agent 启动而打开 OPC（默认用户提出此需求时为是）。

用户已给出的选择不重复询问。后续本机依赖检查、源码解压、配置和验收直接完成；账号登录、系统权限和真正需要用户输入的情况如实说明。

## 安装

1. 解压到用户可写的固定目录。不要长期留在下载缓存或临时目录；不要仅移动 dist 内的 app/exe，源码目录是运行的一部分。
2. 检查 `node --version`。需要 Node.js 24 或更新版本；缺失时从 https://nodejs.org/en/download 下载适配 OS/CPU 的官方版本，依现有授权安装。不要引用分享者的 Node 路径。基础窗口零 npm 依赖。
3. 检查用户已安装且已登录所选 Agent。WorkBuddy 使用它自己的本机账号。Codex 通过已安装的 `codex mcp` 命令配置。
4. 网页：`node scripts/deploy.mjs --mode web --bind workbuddy --autostart agent --company "用户的名字"`。
   独立窗口：`node scripts/deploy.mjs --mode app --bind codex,workbuddy --autostart agent --company "用户的名字"`。
   按用户选择替换 bind；取消伴随启动用 `--autostart off`。已有端口冲突用 `--port 另一个空闲端口`。先用同样参数加 `--dry-run` 审阅目标即可，不必再次请求用户批准已选择的部署。
5. macOS app 需要 Xcode Command Line Tools；缺失时 `xcode-select --install`，等系统安装完成后重试。Windows app 使用系统 Windows PowerShell 编译一个小型 `dist/OPC.exe` 启动器；需要本机 Edge 或 Chrome。不是打包 Chromium 的独立浏览器内核。
6. 脚本向 WorkBuddy 的 `mcp.json` 合并 `opc-office`，备份原文件并保留其他服务。Codex 使用 `codex mcp add`。如存在另一个目录的同名连接，先查看并迁移该 OPC 连接，不要覆盖整个配置。非标准 WorkBuddy 配置根目录用 `OPC_WORKBUDDY_HOME`，非标准 CLI 路径用 `OPC_WORKBUDDY_CLI`。这些环境设置需要加入该机器的 MCP env/启动环境，不能只在一次临时终端中设置。
7. 在 Agent 内刷新 MCP 或重启 Agent，检查 `opc_status` 工具可用。macOS 原窗口发送需要系统辅助功能授权；系统要求时由用户本人在设置中开启，不能绕过。

## 启动与验收

- `node scripts/launch.mjs` 按保存的选择打开；`--web` 临时打开网页，`--app` 临时打开独立窗口。双击根目录启动文件也按保存的选择打开。
- Agent 初始化 MCP 时自动启动本地后台服务。伴随启动额外注册当前用户登录启动的进程监听器：检测到新 Codex/ChatGPT/WorkBuddy 主进程后打开所选窗口，不反复重开同一次运行中用户手动关闭的窗口。它不是插件热加载回调；启动环境改变后需本机验收。
- 打开页面后必须看到真实连接信息；不得以页面可打开或安装脚本退出 0 宣称任务链路成功。
- 发一个隔离目录中的短任务，要求读取该目录测试文件并回复其内容；检查实际消息、Agent 原对话 ID、人物状态、最终回复、完成状态。需要消耗实际账号用量，属于已授权绑定验收，不发送外部消息。
- 两个 Agent 都选择时，分别验证，不用 WorkBuddy 成功代替 Codex 成功。
- 安装后检查：Agent 关闭后再启动时 OPC 是否按所选形式自动打开；要关闭用户现有正在执行任务的 Agent，必须先等待任务结束，不能强制退出。
- 给用户返回实际入口、安装目录、绑定 Agent、启动方式和通过/未通过项。

## 当前不能承诺的能力

发布者只在自己的 macOS 上验证过 WorkBuddy 5.5.3 和 Codex 的真实任务闭环；用户已反馈 Windows WorkBuddy 实机试用正常，具体功能覆盖仍需逐项确认。Windows Codex 桌面同步在代码中明确不可用。Windows 可部署网页/独立窗口和尝试 WorkBuddy ACP，但必须在朋友电脑上完成真实派单验收；失败就报告具体原因，不能展示“已完全绑定”。

复杂原生提问、自由文本问题和 WorkBuddy 桌面工具批准仍需打开原窗口处理；明确的单问题单选可以从 OPC 提交。

移动安装目录或更换 Node 路径后，重新运行部署；若旧 opc-office 指向旧目录，只迁移这一项。卸载时先 `node scripts/deploy.mjs --mode web --bind none --autostart off --no-open`，再从所选 Agent 移除 opc-office；用户要保留的数据在 .local，不自行删除。

## 公司招牌

首次部署必须询问名称，通过 `--company` 传入；交互终端缺省会提示，Agent 非交互执行缺省会停止并要求补充名称，不会偷偷采用分享者名称。已有办公室重新部署保留名称，后续点击左上角公司名称修改即可。名称写入本机 .local，分享包不携带它。
招牌底图与文字已分离；固定字体、描边和阴影随源码提供，改名只改文字，较长名字自动缩小以保持在牌内。不要生成新招牌图片、替换字体或修改场景。

## 闲时彩蛋

点击空闲员工可随机听段子、选择接话；忙碌或等待处理任务的员工不闲聊。内置原创办公室段子，点击本身不调用模型；不重复记录保存在本机 .local/easter-eggs.json。

自动更新默认开启：办公室服务运行期间每分钟检查，到期且 Agent 空闲时，复用部署选定的 Codex / WorkBuddy 搜集新内容。首次空闲约两分钟后尝试，成功后随机间隔 18～36 小时，失败六小时后再试。会使用用户 Agent 用量；可在员工档案 → 彩蛋更新暂停或手动搜集。服务关闭时不运行，也不会补发错过的多个更新。

更新需能联网搜索并返回带来源、有效期的原创对话；失败保留旧库。热点过期自动停用，原创常驻段子继续可用。刷新 MCP 后可用 opc_easter_eggs 查看状态、请求更新或发布 Agent 实际检索的彩蛋。不要把仅能抽取内置段子说成联网更新成功。

安装验收增加：空闲员工连续点击五次有不同台词、可以接话；忙碌员工不被打断；至少完成一次真实搜集并检查来源和入库数量。Windows 此新增功能需要接收方单独验收，此前 WorkBuddy 派单成功不代表彩蛋搜集已验证。
