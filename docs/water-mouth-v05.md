# 喷水嘴型与蓄水动作 v0.5

角色待机与蓄力时自然合嘴。喷水前先闭嘴压低身体，再张嘴发射；停水后收回下颌，恢复站姿。原网格与贴图不变，动作烘焙到原骨架的 Jaw 骨骼，GLB 可直接在 Three.js 中播放。

| 时间 | 角色动作 | 水效果 |
| --- | --- | --- |
| 0–0.23 秒 | 闭嘴、身体轻微压低、尾巴抬起 | 不出水，嘴外没有蓄力水团 |
| 0.23–0.33 秒 | 快速张嘴 | 张嘴末段出现小水珠 |
| 0.33–0.66 秒 | 张嘴保持，起喷时头部轻微后坐 | 发射浅青灰水束 |
| 0.68–0.90 秒 | 逐渐合嘴、抬起身体 | 已喷出的余水继续落地 |
| 0.90–1.00 秒 | 回到闭嘴待机姿态 | 淡水纹继续消散 |

`WaterCharge` 仍是可循环的一秒闭嘴蓄力姿态；直接播放 `WaterShoot` 也包含完整准备动作。摸头和进食会在动作中适当张嘴，结束后回到合嘴姿态。

源文件：`game-assets/source/mudkip-animations.blend`。运行角色：`game-assets/characters/mudkip/mudkip.glb`。水流事件更新为 `water_start=0.33`、`water_stop=0.66`，动画时长更新为 1 秒。水珠时间由事件推导，避免在闭嘴阶段漏水。

验证完成：六个 GLB 均为零错误、零警告；七段动画均有正确变形与循环衔接；浏览器检查了蓄力及准备阶段闭嘴、发射阶段张嘴、结束合嘴、无提前出水、反向拖动、慢放、暂停、中断清理、落地碰撞与手机取景；重复喷水未增加几何体或纹理。Vite 构建通过，仅保留已有的 JS 分包体积提示。

浏览器测试结果：`docs/game-resources-browser-tests.json`、`docs/water-gun-v05-tests.json`。

正常速度演示：`renders/water-mouth-v05.webm`；分段截图：`renders/water-mouth-v05-closed.png`、`renders/water-mouth-v05-open.png`、`renders/water-mouth-v05-recovered.png`。
