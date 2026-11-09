# 轻快步态与落点提示 v0.8

入口：<http://127.0.0.1:5173/resources.html?scene=garden>。

## 视觉与手感

走路改成四足错相的轻快小步：0.5 秒一轮，步幅 0.185 米，抬脚最高约 0.05 米。身体小幅上下和左右摆动，头部反向轻微补偿，头鳍、尾鳍带有滞后的摆动。

小跑为 0.4 秒一轮的对角足步态：蹬地、压低身体、短暂腾空、收腿落地。每组对角足的接地比例为 0.34，摆腿阶段最高抬脚约 0.078 米，脚尖随抬腿翻起；身体起伏约 0.044 米，尾鳍摆动与头鳍回弹比走路更明显。

走路和跑步的地面速度分别为 0.6607、1.5441 米/秒，约为 v0.7 的 2.52、2.66 倍。速度根据接地阶段的足部行程校准，动画时钟随实际速度改变。运行时加入短促的加速与刹停、轻微的加速前倾和转弯侧倾；到达后回正。移动切换混合为 0.12 秒。

为了改善接地插值，骨骼以 120 FPS 烘焙。该采样率用于资源数据，网页播放仍由真实时间驱动，不要求浏览器达到 120 FPS。Blender 源文件采用丢帧同步模式，避免视口性能影响动作的实际速度。

## 落点提示

删除路线线条，仅保留落点圆环。圆环为白色双边与薄荷绿主体，中心有小点，底部有很淡的绿色衬色。几何尺寸根据相机距离调整，主体目标为 36 CSS 像素，白边后约 40 像素；桌面与手机保持相近大小。

点击后约 0.18 秒弹出，并在 0.5 秒内扩散一道细环；等待期间轻微呼吸。到达时在 0.28 秒内收拢、淡出。暂停时冻结时间；改点复用现有几何体和材质。寻路继续在内部计算，绕行与碰撞逻辑保留。

## 资产

新动作同步到 `game-assets/characters/mudkip/mudkip.glb` 与 `animations.json`。编辑源为 `game-assets/source/mudkip-animations.blend`，项目根目录另存为 `mudkip-toon-v08.blend`。三渲二材质、骨骼、UV 与闭嘴蓄水时序继续保留。

落点模块为 `animation-test/src/destination-marker.js`，同步复制到 `game-assets/gameplay/destination-marker.js`。加减速、转向和动作播放速率在 `animation-test/src/main.js` 中衔接；`garden-navigation.js` 提供剩余路线距离，供停步减速使用。

近景步态演示为 `renders/locomotion-v08.webm`，落点截图为 `renders/movement-v08-desktop.png` 与 `renders/movement-v08-mobile.png`。

## 验证

Blender 构建检查所有动作循环衔接和肢体可达范围，最大不可达误差为零。Three.js 接地检查样本中，跑步脚掌骨骼的垂直插值偏差约 0.19 毫米。

`test:movement-feel` 检查起步加速、走跑速度区分、停步回正、转弯侧倾、圆环在桌面及手机的实际投影大小、无路线线条、暂停、到达淡出，以及连续改点后的 GPU 资源复用。约 1.74 米的相同路程，模拟时间为走路约 2.73 秒、跑步约 1.25 秒。

结果：`docs/movement-v08-feel-tests.json`、`docs/garden-movement-v08-browser-tests.json`、`docs/game-resources-browser-tests.json`、`docs/game-animation-validation.json`。完整检查命令为 `npm run test:resources`、`npm run test:movement`、`npm run test:movement-feel`、`npm run test:water`、`npm run test:toon` 与 `npm run build`。
