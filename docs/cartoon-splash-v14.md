# 逐帧卡通水花 v0.14

## 当前修正 v0.14.2：入水和上岸各一次水花，游泳用波纹

入水接触瞬间播放一次水花，约 0.44 秒。上岸在身体离开池水的瞬间播放一次较小水花，约 0.36 秒，位置固定在最后的水面接触处，不落在干岸上。持续游泳只保留贴水面扩散的少量波纹，划水和水枪命中池面不会额外生成竖起的水花。

波纹按实际移动距离触发，间隔至少 0.62 秒，最多三道，1.3 秒内淡去。停下后不再发出新波纹。播放器复用两个 Sprite。

回归检查分别统计 entry / exit 次数，确认入水与上岸各触发一次、游泳不会重复发射。结果：docs/pond-swimming-v14.2-tests.json。当前预览：renders/swimming-v14.2-entry-exit.webm。

以下为 v0.14 的历史说明；触发方式以上述修正为准。

采用用户选定的第 1 个参考：[Dmitry Sarkisov / Water Splash 2D VFX Animation](https://realtimevfx.com/t/water-splash-2d-vfx-animation/16822)。原作是个人展示动画，没有提供透明素材包或开放素材许可。本项目参考其水冠翻起、拉伸破开、碎滴回落的动作原则，用内置 imagegen 工具生成了独立透明序列，不使用原 GIF 作为运行素材。

## v0.14 初始效果（历史）

- 替换上版水面上的白色弧线和两侧白色线条，使用真正的逐帧图形动画。
- 16 帧，4×4 图集。入水单次播放约 0.72 秒，左右划水各播放约 0.64 秒。
- 划水相位 0.16 / 0.66 交替触发。发出后留在排开水的位置，不粘着角色滑动。
- 白色高光、浅青水体与蓝灰阴影。图集保留真实 alpha，运行时不显示参考图背景。
- 六个 Sprite 复用同一张纹理。水面正常遮挡底部，角色正常遮挡远侧水花；没有强制盖在角色前面。
- 暂停冻结逐帧播放；停止游动后播完收尾；上岸、重置和切换场景清空。
- 装饰水花禁用射线拾取，避免影响水枪瞄准和点击地面。

## 文件

- 透明图集：`game-assets/fx/textures/cartoon-splash-v14.png`，1254×1254，699601 字节。
- 元数据：同目录 `cartoon-splash-v14.json`，包含各帧水面接触点，用于稳定底部锚点。
- 播放器：`animation-test/src/cartoon-splash.js`，资源包副本 `fx/cartoon-splash.js`。
- 发射接入：`animation-test/src/pond-water.js` 与 `main.js`。
- 近景预览：`renders/swimming-v14-cartoon.webm`。
- 原始生成图保留在 Codex generated_images，项目内使用已复制的图集。

## 生成方式与最终提示词

使用内置 image_gen.imagegen，transparent_background=true。参考输入为从原作 GIF 提取的动作联系表 `renders/reference-water-contactsheet.png`，仅作造型与动作分析。未使用 CLI/API 回退。

```text
Create a production-ready TRANSPARENT sprite sheet for a small hand-drawn anime/cartoon water splash effect in a cozy 3D garden game. The attached contact sheet is ONLY a reference for the animation principle (a cohesive water crown lifts, stretches, opens holes, breaks into a few droplets and falls). Create independent new artwork, not a copy of its exact shapes or background. Output one square 1024x1024 RGBA image, EXACTLY 4 columns by 4 rows of equally sized 256x256 invisible cells, EXACTLY 16 animation frames in row-major order. Absolutely NO labels, numbers, lettering, grids, borders, backgrounds, shadows, reflections, blue floor, or reference-sheet gray panels. Every cell has a fully transparent background. Show only the water itself. Style: elegant hand-drawn Japanese animation VFX, rounded flowing silhouettes, only opaque pearly white highlights, very pale cyan water body, and muted light blue shadow shapes, clean flat cel colors, no black outlines, no glow, no realistic noise. View: slightly elevated three-quarter front view, so the base is a shallow ellipse. Shape scale and camera stay consistent throughout. Ground contact anchor in EVERY cell must be at x=128 y=220. Allow at least 22 pixels padding to every cell edge, and never cross cell boundaries. This is a gentle small splash, not a magical spike, geyser, explosion, smoke, or splashing wave wall. 16 frames: 1 small flattened white/cyan water crown; 2 crown expands with three rounded lobes; 3 lobes rise; 4 one asymmetric curved tongue lifts higher; 5 the curved tongue rolls outward with two small droplets; 6 slight peak, graceful hook and open white center; 7 same shape pulling apart; 8 thinner curled sheets open two holes; 9 two small lobes falling with detached rounded droplets; 10 shrinking lower lobes and three droplets; 11 most sheet fallen into a small flattened splash with two falling drops; 12 small white broken foam marks and one falling drop; 13 two tiny foam marks; 14 one tiny fading foam mark; 15 and 16 completely transparent empty cells. Keep the effect readable at small game size. The palette should remain mostly white with pale cyan/blue shading throughout. Anatomically coherent temporal progression, each frame feels like the next drawing of the same water mass.
```

生成图实际尺寸为 1254×1254，原图未重绘或裁切。运行时按 4×4 UV 分格，借助 alpha 分析得到的各帧锚点对齐水面接触线。

## 检查

test:swimming 已覆盖单次入水动画、16 帧信息、划水触发、停止收尾、暂停冻结、上岸与场景清理、水中喷水、果篮衔接及初始手机视口。
