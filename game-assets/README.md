# 水跃鱼游戏资源 v0.21.11

可以直接用于 Three.js 的资源包：十二段角色骨骼动画、庭院、树果和三种靶子。编辑源文件与浏览器运行文件分开保存。

v0.21.11 按白浪头分镜更新庭院水枪。水束顺着张开的嘴形喷出，浅青水束前端带奶白浪头，撞到表面后绽开三瓣水花。

v0.21.10 加宽水枪的出水口，第一拍就喷出饱满的圆头水束。水束采用浅青色块、蓝灰描边和随流动前进的白色弧纹，命中时溅出圆润的白色水花。

v0.21.9 调整水枪为日式动画风格。白色短纹随水束向前流动，落点的泡沫先沿表面摊开，短水花和水滴分别飞散后回落。

v0.21.8 重做水枪的连续水束和冲击效果。水柱由细水颈扩开，弹道更平，命中时短暂炸开白色水花，靶子顺来水方向回弹。

v0.21.7 新增掷泥技能。水跃鱼用前爪刨泥，朝当前方向或锁定的靶子甩出泥团。命中靶子会出现泥花和「啪嗒！」，泥印贴在落点约 1.5 秒。动作和弹道位于 `gameplay/garden-mud.js`，特效位于 `fx/mud-effects.js`。

v0.21.6 新增撞击技能。点按技能键后，水跃鱼向锁定的练习靶或当前朝向蹬地前扑，最多两米。腾空时收腿，落地前伸出前爪。命中显示漫画爆裂和「砰！」，撞到障碍或冲空会刹停。动作状态和位移由 `gameplay/garden-tackle.js` 控制，速度线、尘土和命中特效在 `fx/tackle-effects.js`。

v0.21.5 在小屋正面右窗旁增加陶制风铃。微风或角色靠近时，风铃和纸签摆动，铃身短暂亮起。`rendering/garden-wind-chime.js` 接收小屋的盒形碰撞范围，返回可加入庭院的 `object`。每帧调用 `update(delta, actor.position)`，角色复位时调用 `reset()`。

v0.21.4 为远岸的睡莲添加探索互动。偶尔冒出的气泡提示位置。角色游近时，睡莲拨开并露出水下的鹅卵石。互动由 `fx/pond-water.js` 驱动，内部使用 `fx/pond-lily.js`。

v0.21.3 在小屋旁的高草丛增加蝴蝶。角色走进草丛时拨开附近的草簇，蝴蝶绕角色半圈后落到花上。`rendering/garden-meadow.js` 返回可加入庭院的网格。移动更新后调用 `meadow.update(delta, actor.position)`，角色复位时调用 `meadow.reset()`。

v0.21.2 增加小屋旁可穿行的草丛，运行模块为 `rendering/garden-meadow.js`。

v0.21 增加庭院脚印。走路和小跑在落脚时留下对应地表的脚印，上岸后的前几步带有湿印。脚印会逐渐淡去，运行模块为 `gameplay/garden-footprints.js`。

v0.21.1 精简脚印为两只后脚的短轨迹，最多绘制 16 枚。复用移动时的地面检测，淡出由着色器完成。

v0.20.2 恢复庭院原有的小圆树和扁圆树造型。树上的苹果与橘子缩小约三成，落地和进食沿用缩小后的尺寸。

v0.20 增加苹果、橘子和李子。果篮依次提供四种水果。点击果树，再点水枪即可打落同一棵树上的果实。落地后点击任意一颗，水跃鱼会走过去吃。果树位置和落点见 `levels/garden-fruit.json`，水果造型和采摘逻辑见 `gameplay/garden-fruit.js`。

v0.19.1 放大三支舞的动作：A 加强左右踏步和点头，小跳约 8 厘米；B 加强扭腰、摆尾和歪头，前脚仍贴地；C 加强点脚、转完后的晃动和小跳，保留转圈时交替落地和结尾眯眼。

v0.19 将舞蹈接入庭院角色点击：A/B/C 随机轮换，每三次包含全部三支，跨轮不连续重复；每次只播放一轮后待机。连点不重启正在播放的舞蹈，暂停时点击可继续。吃果子时点击会吃完再跳，水中点击则上岸后跳；移动、果篮、喷水、场景切换与重置会取消待执行请求。动作台的循环预览独立恢复，画布拖动仅旋转相机。

v0.18 增加 C「转圈庆祝舞」：5 秒单次播放，两次点脚后以交替落地的小步转一圈，转完轻晃找平衡、小跳抬头，开心眯眼停留后回到待机。旋转期间支撑脚的位置和朝向固定在地面，转完补齐脚步。眼睛复用原始图集的笑眼格，无需重画贴图；Three.js 的 `rendering/eye-expressions.js` 按 `animations.json` 中的表情轨道采样，Blender 通过 `EyeSmile` 驱动相同 UV 位置。可暂停、拖动进度或打断表情，其他动作恢复睁眼。编辑源为 `mudkip-toon-v18-celebration.blend`，预览入口 `resources.html?clip=DanceC`。

v0.17 增加 B「扭扭尾巴舞」：3 秒循环、120 BPM、6 拍；前脚固定、后脚交替轻抬约 8 毫米，臀部轻扭，尾鳍延迟跟随。中间歪头停顿，再继续两次摇摆并回到起始姿势。动作台的「尾巴舞」按钮播放 `DanceB`，`resources.html?clip=DanceB` 可直接预览并拖动旋转。编辑源为 `mudkip-toon-v17-tail-dance.blend`。

v0.16.1 修复喷水拖动丢失松开事件后相机一直锁定的问题：无按键悬停、新的主指针操作、窗口切换与视角重置都会恢复输入状态。防文字选中处理保留，3D 画布手势交给相机控制器。

v0.16 重做走路与小跑的腿部姿态：固定膝肘弯曲平面，脚掌平放，取消横向划腿与额外脚尖旋转。重心抬高，走路抬脚约 2.5 厘米，小跑以对角腿支撑，增加约 3.2 厘米的短促腾空与落地缓冲。步幅和循环同步缩短，移动速度保持约 0.66 / 1.54 米每秒；循环为 0.40 / 0.35 秒。头部反向补偿身体俯仰，头鳍和尾巴延迟跟随。编辑源为 `mudkip-toon-v16-locomotion.blend`。

v0.15 增加 A「摇摇踏踏舞」：4 秒、120 BPM、8 拍循环，依次左右踏步、两次点头、侧移回位和蓄力小跳。v0.15.1 将膝肘弯曲方向固定在前后平面，减小抬脚与横移，取消脚尖扭转；身体、头鳍和尾巴承担主要摇摆。动作台的「跳舞」按钮播放 `DanceA`；`resources.html?clip=DanceA` 可以直接预览。编辑源为 `mudkip-toon-v15-dance.blend`。

v0.14.2：入水和上岸各触发一次水花，上岸水花固定在最后的水面接触处。游泳只保留贴水面扩散的波纹。

v0.14 按选定参考接入独立生成的透明逐帧卡通水花，替换平面白色弧线。16 帧覆盖水冠翻起、破开和水滴回落；入水与左右划水单次触发。图集和播放器在 `fx/`，项目说明 `docs/cartoon-splash-v14.md`。

v0.13.1 将游泳波纹改为少量较大的断续白色浪纹，身体两侧随划水出现小浪花；保留 v0.13 的模型与动作。

v0.13 采用参考方案的真实高度场扰水，降低波幅与高光；游泳改为前倾、划水和收腿回摆，加入起停与转向缓冲。最新编辑源为 `mudkip-toon-v13-swimming.blend`，说明见项目 `docs/pond-swimming-v13.md`。水面上游 MIT 代码与许可包含在 `fx/vendor/`。

v0.12 增加 Swim / SwimIdle 骨骼循环、卡通浅水 Shader 与入水、游泳、上岸控制器。最新编辑源为 `mudkip-toon-v12-swimming.blend`；水面效果位于 `fx/pond-water.js`，游泳控制器位于 `gameplay/garden-swimming.js`。参考与接入细节见项目 `docs/pond-swimming-v12.md`。

v0.11 重做 2.6 秒进食动作：0.34–0.70 秒咬住并合嘴，随后三次逐渐变慢变轻的咀嚼，1.72 秒进入闭嘴吞咽，2.02 秒起抬头并轻晃尾鳍表示满足。浏览器在咬合时隐藏水果并显示少量果屑，满足时出现两颗短暂爱心；水果始终保留防穿模间距。最新编辑源为 `mudkip-toon-v11-eating.blend`。

v0.10.1 修正喷水收尾时头部瞄准偏移在恒定关键帧上累积、切回待机时闪动的问题。接入时在动画混合更新前调用 `combat.restorePose()`，再在更新后叠加 `combat.pose()`，详见 gameplay 接入说明。

v0.10 用右下角独立水枪技能键统一电脑与手机操作：无目标时点按朝面前喷水，按住拖动自由选择方向，松开发射；点靶子可选锁定，再点技能键命中。草地始终用于移动，界面不再提供移动／瞄准模式切换。技能键在准备、喷水和恢复阶段显示状态；触控捕获、取消、暂停及场景切换均已接入。

v0.9 接通瞄准、水枪与命中反馈：点击靶子锁定、转身抬头、闭嘴蓄水，按空格或屏幕按钮发射；也可在瞄准模式下点击草地自由喷水。水流按真实弧线与庭院网格碰撞，第一股水抵达靶面后才计一次命中。靶面回弹、水色闪光、短促水花和「命中 +1」共同反馈结果，支持手机触控。此次只修改 Three.js 逻辑，角色与庭院模型继续使用 v0.8 / v11 的源文件。

v0.8 重做走路与跑步：加大步幅和抬脚、加入跑步蹬地与短暂腾空、头鳍与尾鳍滞后摆动，并将地面速度提升至约 0.66 / 1.54 米每秒。移动加入加减速、转弯倾斜与停步回正。落点改为白边薄荷绿圆环，随点击扩散、到达收拢，不显示路径线。入口为 `resources.html?scene=garden`，接入说明见 [gameplay/README.md](gameplay/README.md)。

## 目录

```text
game-assets/
  manifest.json                       # 文件路径、体积、SHA-256、三角面与动画清单
  characters/mudkip/
    mudkip.glb                        # 角色 + 25 根骨骼 + 十二段动画 + 两张内嵌贴图
    animations.json                   # 循环、时长、切换、事件与移动速度
  environments/garden.glb             # Meshopt 压缩的静态庭院
  props/
    berry.glb                         # 可单独摆放的树果
    target-normal.glb                 # 普通靶
    target-moving.glb                 # 移动靶主体；轨道保留在庭院
    target-heavy.glb                  # 重型靶
  levels/garden.json                  # 出生点、镜头、靶子布局、22 个基础障碍范围
  fx/water-gun.js                     # 可在 Three.js 中复用的水枪效果
  rendering/toon-style.js              # 三渲二材质、配光与骨骼轮廓线
  rendering/README.md                  # Three.js 接入方式与 Blender 材质说明
  gameplay/garden-navigation.js        # 碰撞、A* 寻路与路径跟随
  gameplay/destination-marker.js       # 屏幕尺寸稳定的落点圆环
  gameplay/water-aim.js                # 与水流一致的低弧线瞄准解算
  gameplay/garden-combat.js            # 瞄准、转向、施法与命中状态
  gameplay/target-feedback.js          # 靶面回弹、命中闪光与计数
  gameplay/water-skill-input.js        # 技能键的点按、拖动与触控取消
  gameplay/README.md                   # 移动与水枪模块接入说明
  licenses/                           # Kenney 与 KayKit 原始许可
  CREDITS.md                          # 来源记录
  source/                             # 编辑源与兼容版本，不进入网页运行包
    mudkip-animations.blend
    garden-runtime.blend
    garden-uncompressed.glb
```

单位为米，Three.js 中 `+Y` 向上，角色正面为 `+Z`。树果和靶子原点位于底部；庭院保留统一世界坐标。

## 基础动画

| 名称 | 时长 | 循环 | 行为 |
| --- | --- | --- | --- |
| `Idle` | 3.0 秒 | 是 | 闭嘴呼吸、头鳍和尾巴轻摆 |
| `Walk` | 0.5 秒 | 是 | 四足错相、轻快抬脚、身体轻摆 |
| `Run` | 0.4 秒 | 是 | 对角足蹬地、短暂腾空、头尾滞后回弹 |
| `PetReaction` | 1.6 秒 | 否 | 蹲身、抬头歪头、摇尾 |
| `Eat` | 2.6 秒 | 否 | 咬住合嘴、三次咀嚼、闭嘴咽下、抬头晃尾满足 |
| `Swim` | 约 0.717 秒 | 是 | 四肢划水、尾鳍摆动 |
| `SwimIdle` | 2.4 秒 | 是 | 停在水面踩水、缓慢摆尾 |
| `WaterCharge` | 1.0 秒 | 是 | 闭嘴压低身体、准备喷水，可持续保持 |
| `WaterShoot` | 1.0 秒 | 否 | 闭嘴蓄力、张嘴发射、合嘴恢复 |

所有动作保持原地。单次动作完成后切回 `Idle`，默认混合 0.22 秒，移动动作的混合为 0.12 秒。`WaterShoot` 自带准备动作，直接播放也会先闭嘴蓄力，首尾回到闭嘴待机姿态。

喷水分段：0–0.23 秒闭嘴蹲身；0.23–0.33 秒快速张嘴；0.33–0.66 秒出水；0.68–0.90 秒合嘴；最后恢复站姿。原模型的静置嘴型为张嘴，通过 Jaw 骨骼约 -0.37 弧度闭合，未修改原始网格和贴图。摸头与进食仍在动作中适当张嘴，结束后合嘴。

走路和小跑的代码移动速度分别约为 `0.6607` 和 `1.5441` 米/秒，约为上一版的 2.52 / 2.66 倍。速度根据脚掌接地阶段的行程校准；加减速时，动作播放速率也随实际速度改变。关节以 120 FPS 烘焙，改善接地阶段的插值，浏览器播放不要求 120 FPS。

## 挂点与事件

嘴部挂点为 `Socket_Mouth`，跟随 Head 骨骼，导出后挂点局部 `+Z` 为喷水方向。使用世界位置与世界四元数发射，保证角色转向、抬头时仍对准嘴部。

| 动作 | 时间 | 事件 |
| --- | --- | --- |
| `Eat` | 0.36 秒 | `food_attach`，树果停在嘴外 |
| `Eat` | 0.70 秒 | `food_consume`，咬合时隐藏树果、出现果屑 |
| `Eat` | 0.90 / 1.16 / 1.48 秒 | `chew`，三次咀嚼 |
| `Eat` | 1.72 秒 | `swallow`，闭嘴吞咽 |
| `Eat` | 2.02 秒 | `satisfied`，抬头、晃尾和短暂爱心 |
| `WaterShoot` | 0.33 秒 | `water_start` |
| `WaterShoot` | 0.66 秒 | `water_stop` |

步伐事件也记录在 `animations.json`。游戏应在动作时间跨过事件时触发一次；循环动作每轮重置，切换或中断时取消旧动作的未触发事件。不要依赖全局计时器追踪动作事件。

预览页使用这些事件显示树果与水枪，供校对时间。蓄力时嘴外不显示水团；起喷水珠只在张嘴末段出现。背包扣减、命中与计分尚未接入。

## Three.js 载入

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const character = await loader.loadAsync('characters/mudkip/mudkip.glb');
const garden = await loader.loadAsync('environments/garden.glb');
// AnimationMixer 的根节点使用 character.scene。
// 移动包住整个 character.scene 的容器，同时带动骨架与蒙皮。
```

庭院约 2.60 MB，压缩前约 8.85 MB。环境材质已将草地遮罩、树木渐变和程序颜色烘焙为顶点颜色，浏览器保留这些颜色并自行计算光照。水面使用简化的实时材质；Blender 的灯光、雾和水面噪声不随 GLB 自动迁移。

角色源文件 `source/mudkip-animations.blend` 已配置 Eevee 三档明暗与可随骨架变形的描边壳；项目根目录另有便于直接打开的 `mudkip-toon-v08.blend`。GLB 保留原始可移植贴图与动画，网页加载后调用 `rendering/toon-style.js` 应用动画材质。描边壳不进入 GLB，避免重复描边。

庭院包含 10 个语义分组，因不同材质在 Three.js 中展开为约 50 个渲染网格。静态场景约 15.7 万三角面，尚未进行手机硬件帧率与 LOD 优化。

`levels/garden.json` 提供房屋、树干、栅栏和水池的简化障碍范围、可走区域边界与角色占地设置。`gameplay/garden-navigation.js` 使用这些数据进行碰撞与网格寻路；靶子和树果篮在测试页补充占地。

## 预览与重建

在 `../animation-test/` 执行 `npm run dev`，打开 <http://127.0.0.1:5173/resources.html>，可切换“动作台”和“庭院总览”。

安装过 Node 依赖后，在项目目录执行：

```powershell
.\scripts\build-game-assets.ps1
```

重建会读取原始角色和已确认的 v11 庭院，生成本目录的资源并同步到测试页。源场景与旧版测试文件保留。

验证命令在 `../animation-test/` 中运行：

```powershell
npm run assets:prepare
npm run test:resources
npm run build
```

浏览器测试需本机 Edge 与已启动的本地测试页。来源及许可见 [CREDITS.md](CREDITS.md)，不同来源的内容保留各自的权利状态。
