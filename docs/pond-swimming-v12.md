# 水池与游泳 v0.12

## 查到的实现与取舍

- [Roystan：Toon Water](https://roystan.net/articles/toon-water/)：卡通水面中的深浅颜色、岸边泡沫、噪声扭曲水纹。参考表现方法，自行编写 GLSL，没有复制 Unity Shader。
- [Three.js Water 文档](https://threejs.org/docs/pages/Water.html)、[Water2 源码](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water2.js)：平面水面、流动法线、反射与折射。它们适合需要明显环境倒影的水面。这一小池塘采用较简洁的颜色与高光，沿用 WebGLRenderer，不引入额外反射相机或 WebGPU 依赖。

原版本是静态纯色透明面与三条烘焙水纹。新版本使用独立 ShaderMaterial，保留原池塘形状、地形凹槽、池底石子和荷叶，隐藏旧水纹。在西岸移除两颗完整的石头网格岛，形成实际可通过的入水缺口。

## 画面

浅水薄荷青 `#a6ded0`，中部青灰蓝 `#5aaeb5`，泡沫乳白 `#effff1`。池边有细且断续的亮边，中部仅保留低对比漂移高光与扭曲光纹。根据椭圆水池的径向位置近似浅盆深度，不是全屏深度采样；透明混合让池底与水下身体略微显现，不是物理折射。

入水与出水触发十颗复用水滴和扩散涟漪。游动时约每 0.17 秒留下波纹，并在身体后方绘制短 V 形尾迹；停下后约每 1.05 秒产生一次轻涟漪。最多保留十二道涟漪。效果统一使用模拟时间，暂停时全部冻结，场景切换和重置清空。水枪命中水面也触发池面水花。

主要实现：`animation-test/src/pond-water.js`，导出副本为 `game-assets/fx/pond-water.js`。不加载额外图片，不创建反射渲染目标；水滴几何与材质在初始化时创建后复用。

## 动作与交互

| 动作 | 周期 | 表现 |
| --- | --- | --- |
| Swim | 约 0.717 秒 | 四肢交替划水、尾鳍左右摆、头鳍滞后摆动，身体轻微起伏 |
| SwimIdle | 2.4 秒 | 小幅踩水、较慢摆尾和轻微浮沉 |

两段动作是 Blender 烘焙的真实骨骼循环，已经包含在角色 GLB 与 animations.json 中，没有水平根位移，首尾顶点连续。编辑源：`game-assets/source/mudkip-animations.blend`，另存 `mudkip-toon-v12-swimming.blend`；生成脚本为 `scripts/build_animation_test.py`。

点击水面 → 使用原有陆地寻路到西岸 → 约 0.95 秒入水 → 游到点击位置 → 踩水待机。点击草地 → 约 1.15 秒从缺口上岸 → 使用原有寻路前往目的地。过岸时根据真实地面高度约束身体高度，避免先陷进岸边地面。

游速约 0.65 米/秒，转向约 4 弧度/秒；水中身体基点为水面以下 0.16 米。游泳终点在池边内缩 0.42 米，保留身体空间，避免穿岸或游出庭院。小池塘只供短距离游动，不会扩大原场景。

水中可使用水枪，结束后回到踩水；入水、上岸期间暂缓技能。点击果篮先上岸，再走去吃果子。上岸途中重新点击水面会完成上岸后再返回，避免突然改变高度。暂停、重置、切换场景均有状态清理。

控制器：`animation-test/src/garden-swimming.js`。原 `garden-navigation.js` 保留陆地池塘避障；宿主先把水面点击交给 swimming.request()，未处理的点击才走陆地寻路。状态有 land、approaching、entering、swimming、exiting，回调接入参考 main.js。

## 验证

`npm run test:swimming`：真实水面点击、岸边到达、入水水花、水中移动与安全边界、暂停、水中喷水、上岸后继续移动、上岸途中改点、先上岸再吃果子、动作台预览、场景清理和手机触控。结果：`docs/pond-swimming-v12-tests.json`。

`test:resources` 同时检查九段动画的实际变形、循环接缝与根位移；`test:movement`、`test:skill`、`test:basket` 检查原有玩法。GLB 使用 glTF Validator 校验。
