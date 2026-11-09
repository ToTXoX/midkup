# 进食动作 v0.11

Eat 从 1.8 秒等速张嘴调整为 2.6 秒分段表演，保留脚掌 IK 接地与首尾待机姿态。

- 0–0.34 秒：轻微压低身体，闭嘴靠近水果。
- 0.34–0.70 秒：下颌张开后短促咬合，0.70 秒隐藏水果；水果保持完整体积停在嘴外，不再整体缩小到零。
- 0.80–1.66 秒：三个咀嚼峰值位于 0.90、1.16、1.48 秒，开合幅度逐次减弱，每两次之间确实合嘴。
- 1.67–2.02 秒：闭嘴停顿、颈部轻点，表现吞咽。
- 1.95–2.60 秒：抬头、微微偏头、尾鳍弹性摆动，再顺滑回待机。两颗爱心错开出现并在动作结束前淡出。

咬合果屑与爱心均为预创建、按动作时间更新的效果，暂停、反向拖动与打断时同步重建或清除。水果沿真实骨骼变形后的前表面保持 4 毫米间隙；下颌闭合轴跟随头部，满足偏头时也保持闭嘴。

Blender 源：`mudkip-toon-v11-eating.blend` 与 `game-assets/source/mudkip-animations.blend`。运行角色：`game-assets/characters/mudkip/mudkip.glb`，事件见相邻 `animations.json`。浏览器果屑、爱心和防穿模处理位于 `animation-test/src/resource-preview.js`。

`npm run test:eating` 检查四阶段、真实咬合、三次递减咀嚼、闭嘴吞咽、满足、暂停、逆向预览与资源复用；`npm run test:food-contact` 检查不同场景与转向的水果间距。原有七动作资源回归也已执行。报告：`docs/eating-phases-tests.json`、`docs/food-contact-tests.json`。
