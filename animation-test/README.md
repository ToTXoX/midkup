# 水跃鱼动画试验庭

本地 Three.js 动画验证页。载入从 Blender 导出的真实骨骼 GLB，提供待机、原地走路、摸头回应、点击角色、点击地面移动、动作混合、步频、暂停与进度拖动。

最新 v0.14.2：入水和上岸各触发一次水花，游泳使用贴水面的扩散波纹。预览 `../renders/swimming-v14.2-entry-exit.webm`，说明见 `../docs/cartoon-splash-v14.md` 顶部修正。

v0.14：按选定的手绘参考重新生成透明逐帧水花，接入入水与左右划水。素材和提示词见 `../docs/cartoon-splash-v14.md`，预览 `../renders/swimming-v14-cartoon.webm`。

v0.13.1：游泳时使用少量较大的断续浪纹，增加划水处的白色小浪花；停下后自然消散。预览为 `../renders/swimming-v13.1-foam.webm`。

当前 v0.13：安静水池、几毫米的实际扰水与轻折射，取消白圈与直线尾迹；游泳改为前倾划水与收腿回摆。`npm run test:swimming` 验证完整交互。最新模型 `../mudkip-toon-v13-swimming.blend`，说明 `../docs/pond-swimming-v13.md`，预览 `../renders/swimming-v13.webm`。

新版九段动作与庭院资源预览入口为 <http://127.0.0.1:5173/resources.html>，对应 `../game-assets/`；用 `npm run assets:prepare` 同步生成资源，`npm run test:resources` 检查九段动作、道具与场景。首页继续保留最初的三段动作测试。

庭院移动入口为 <http://127.0.0.1:5173/resources.html?scene=garden>。点击草地后自动转向、寻路并绕开静态障碍；支持走路、小跑、暂停、途中改点和回到起点。`npm run test:movement` 检查碰撞几何与真实浏览器操作，模块位于 `src/garden-navigation.js`，接入说明位于 `../game-assets/gameplay/README.md`。

v0.8 重做轻快走与弹性小跑，速度约 0.66 / 1.54 米每秒，加入起停缓冲和转弯侧倾。落点使用醒目的白边薄荷绿圆环，不绘制路线。`npm run test:movement-feel` 检查速度、起停、圆环尺寸、淡出和重复改点资源复用。

v0.9 加入庭院水枪练习：点靶子锁定，按空格或「喷水」发射；点「瞄准」可在草地上自由选点，Esc 返回移动。水跃鱼先转身、抬头并闭嘴蓄水，水实际撞上靶面后显示回弹、水色闪光、水花与「命中 +1」。每发只计一次，支持射程提示、障碍遮挡、移动打断、暂停及触控。`npm run test:combat` 验证完整流程。

当前 v0.10 改为独立水枪技能键：点按朝面前或锁定靶子喷水，按住拖动自由选方向，松开发射；草地始终用于移动，不再切换操作模式。技能键兼容鼠标与手机触控，空格为可选快捷键。`npm run test:skill` 检查完整点按、拖动、指针捕获、取消、暂停与键盘行为。

界面 v11 采用日式动画风格：水跃鱼头像、奶油白角色卡、浅水蓝选中态、深蓝灰描边、金边命中徽章与水滴技能键。样式集中于 `src/anime-ui.css`，说明见 `../docs/anime-ui-v11.md`，模型与操作规则沿用原有版本。

角色卡只保留头像与带小尖角的两行对话框。起点、暂停／继续、视角、动作台四个图标带小字，独立放入画面左侧贴边菜单；默认收起，点击展开按钮显示，再次点击、点击场景或按 Esc 收起。走跑使用水枪键上方的单个图标开关，可在移动途中切换；手机技能键与角色卡并排放在底部。

资源 v0.11 将进食重做为 2.6 秒的咬住、三次咀嚼、闭嘴咽下与满足抬头晃尾，配合少量果屑和短暂爱心。水果保持嘴外安全间距，在咬合时隐藏；`npm run test:eating` 与 `npm run test:food-contact` 验证阶段及防穿模。近景录像为 `../renders/eating-v11.webm`，最新 Blender 源为 `../mudkip-toon-v11-eating.blend`。

庭院现已接入果篮互动：点击果篮，自动沿安全路径走到篮边、转身站稳并播放一次完整进食，结束后回到待机。果篮以每隔 4 秒闪过的小亮光提示互动，手机保留 40 像素隐形触控区。再次点击可再吃一颗，途中点草地、点靶子或施放水枪可取消。`npm run test:basket` 覆盖实际模型点击、寻路、进食、暂停、重复点击、打断、手机触控及场景切换。

## 运行

v0.12 增加卡通浅水着色、岸边亮纹、池底光纹、入水水滴、涟漪和划水尾迹。点击水池会自动走到左岸缺口、入水并游动；点击草地上岸，点击果篮先上岸再进食。角色 GLB 新增 Swim 与 SwimIdle 两段 Blender 骨骼循环。执行 `npm run test:swimming` 检查完整交互；实现与参考资料见 `../docs/pond-swimming-v12.md`，最新编辑源为 `../mudkip-toon-v12-swimming.blend`。

在此目录打开终端：

```powershell
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。首次安装后，后续只需 `npm run dev`。

生产构建：`npm run build`。构建后 `dist/` 是可部署的静态文件，用 `npm run preview` 在本机查看。不要直接双击 HTML，以免浏览器阻止模块或 GLB 加载。

## 操作

- 待机 / 走路 / 摸头：切换动作，混合时间 0.22 秒。
- 点击角色：播放一次摸头回应，Three.js 生成三颗爱心，随后自动回到待机。
- 开启“点击地面移动”：先演示短距离移动，再可点击圆形舞台内的地面改变目标；到达后待机。
- 步频：仅影响走路动作，同时影响行走位移速度。
- 拖动进度：暂停并预览指定姿势；点击“继续”恢复。
- 拖动空白处旋转，滚轮缩放；“重置视角”恢复镜头。

## 文件

- `public/assets/mudkip.glb`：角色、25 根导出骨骼、三段动画、两张内嵌贴图，291,924 字节。
- `src/main.js`：Three.js 场景、动作混合和互动。
- `src/style.css`：桌面与窄屏界面。
- `../mudkip-animation-test.blend`：可继续编辑的独立动画源文件。
- `../scripts/build_animation_test.py`：从原始角色重建动画与 GLB。
- `../docs/animation-test-report.md`：本次验证范围和结果。

## 检查

```powershell
npm run test:asset
npm run test:browser
npm run build
```

浏览器测试需要本机 Microsoft Edge 和已启动的测试页；`TEST_URL` 可指定其他地址。测试会检查真实浏览器中的骨骼变形、循环首尾、动作切换、点击与移动，并保存截图与 JSON 结果。

## 后续接入

将 GLB 通过 `GLTFLoader` 载入，用 `AnimationMixer(gltf.scene)` 播放 `Idle`、`Walk`、`PetReaction`。把整个 `gltf.scene` 放进角色容器，由代码移动和旋转容器；不要只移动单个 SkinnedMesh。

角色正面在 Three.js 中朝 `+Z`，向上为 `+Y`。三段动画均无水平根位移。Walk 的接地阶段脚掌行程为 0.13 米，接地占周期 62%，周期为 0.8 秒，因此默认位移速度为 `0.13 / (0.8 * 0.62) ≈ 0.2621` 米/秒；改变步频时应同比缩放位移速度。

首页是最初的三动作管线测试，舞台为临时测试场景。完整的庭院、碰撞、寻路与水枪功能请进入 `resources.html?scene=garden`。

原模型来源和使用说明见 [素材记录](../docs/asset-credits.md)。
