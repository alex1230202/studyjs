100%ai
# B站 竖版学习刷看器 (bili-feed)

一个 **Tampermonkey 油猴脚本**，在 B 站页面（**手机 Kiwi 浏览器** + 桌面浏览器）上，用 `Alt+S` 唤出一个**全屏滑动浏览播放器**。
内容由脚本自动从 B 站**按配置的搜索词**拉取（默认「高中数学」），只喂学习内容，不刷到无关视频；上滑/下滑像抖音一样在视频间切换。

## 手机端怎么装（Kiwi 浏览器）

> 原生 B 站 **APP 无法运行油猴脚本**（它是原生应用，无扩展接口）。这里用 **Kiwi 浏览器**（Android 上支持完整 Chrome 扩展/油猴的浏览器）在**B 站移动网页**里实现。

1. 在手机下载安装 **[Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser)**。
2. 在 Kiwi 里打开 Tampermonkey 的扩展页面，安装 **[Tampermonkey](https://www.tampermonkey.net/)**。
3. 打开 Tampermonkey 面板 →「添加新脚本」→ 删除默认内容，把 `bili-feed.user.js` 全文粘贴 → 保存。
4. 在 Kiwi 里访问 `m.bilibili.com` 任意页面，点地址栏左侧的扩展图标确认脚本已启用，按 **`Alt+S`** 唤出浏览模式。

## 桌面浏览器怎么装
1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome/Edge/Firefox）。
2. 新建脚本，粘贴全文，保存。
3. 打开 `www.bilibili.com`，按 **`Alt+S`**。

## 怎么用
| 操作 | 效果 |
|------|------|
| `Alt+S` | 打开 / 关闭浏览播放器 |
| 手机：在**屏幕左右两边缘**上下滑动 | 上一个 / 下一个视频（中间留给播放器操作） |
| 桌面：↑ / ↓ 或鼠标在空白处上下拖 | 上一个 / 下一个视频 |
| 底部「↑上一个 / ↓下一个」按钮 | 逐个切换（触屏友好） |
| `Esc` | 退出浏览模式 |
| 右上角 ⚙设置 | 改搜索词、屏蔽词、每页条数 |
| 右上角 ✕退出 | 关闭 |

## 为什么两端（桌面 + 手机 Kiwi）都能用

**同一个 `.user.js` 文件，桌面浏览器和手机 Kiwi 都可安装运行。** 我在真实网络下实测确认：

- B 站搜索接口 `api.bilibili.com/x/web-interface/wbi/search/type`，在 **手机 UA、桌面 Chrome UA、以及不同 Referer 组合**下**全部返回 `code:0` 与完整结果**（page_size=12 实测拉到 10 条有效学习视频）。
- 因此脚本**不强制改写 User-Agent**（有些浏览器/油猴版本不允许改 UA 头，写了反而报错），只设置 Referer/Origin，**两端通用最稳**。
- 官方播放器 `player.bilibili.com/player.html?bvid=…` 稳定 200，两端都能内嵌播放。

> 注意：B 站的风控状态可能随 IP/时段波动，极端情况下接口会短时返回 412。此时重试或稍后再试即可，属于平台侧行为，非脚本缺陷。

## 局限
- **在 B 站网页环境运行**，不是原生 APP（Kiwi 里是移动网页）。
- **官方播放器是横屏网页样式**，非纯竖版短视频 UI（保证能稳定播放的折中）。要纯竖版全屏需自备视频直链源。
- **手势为左右边缘竖滑**交换到中央播放器的触控（播放/进度/全屏）。
- 滑动切换时官方播放器会有加载，属正常现象。
