# 三渲二画面与角色源模型 v0.6

美术方向为干净、明快的日式动画：少量清楚的明暗色块，偏青蓝的阴影，浅暖色光照与细深蓝外轮廓。角色使用较明确的描边，庭院的树木、小屋与靶子使用较轻的绿灰描边，水与花朵保留简洁色彩。

## Blender 源模型

调整结果保存在项目根目录 `mudkip-toon-v06.blend`，并同步到 `game-assets/source/mudkip-animations.blend`。身体和眼睛共同使用三档 Eevee 着色；眼睛贴图中的高光仍保留。原有皮肤色块随同头部接受明暗计算，避免两眼周围出现方形蓝块。

描边使用可编辑的 `Mudkip Ink Outline`，沿用原有骨骼与权重。主模型保持 1,676 个顶点、3,344 个三角面、原始 UV 和贴图；保留源模型的平滑法线。原始导入备份 `mudkip-original.blend` 保留。

七段动画和闭嘴蓄水时序继续使用 v0.5。检查了待机、小跑、进食、蓄力和喷水时的描边形变，描边壳与主模型的最大距离低于 0.004 米。

## Three.js 预览

`animation-test/src/toon-style.js` 负责三档材质、配光和骨骼描边，在网页端应用到角色、庭院与道具。`game-assets/rendering/` 包含相同模块与接入说明。GLB 自身保留可移植的贴图与动画；Blender Shader to RGB 不经 glTF 传递，由网页模块重建相应风格。

水束和散滴的连续物理高光改为简洁的色块高光；保留细水颈、宽水束、浅青灰配色、原有飞行轨迹和落地水花时序。庭院布局与资产位置沿用现有版本。

## 验证

- `scripts/validate_toon_character.py`：源模型节点、拓扑、UV、内嵌贴图、骨骼和描边变形。
- `npm run assets:prepare`：六个 GLB 的格式、哈希与资源同步。
- `npm run test:resources`：七段动作、嘴型、循环、移动、场景切换及手机界面。
- `npm run test:water`：喷水时序、几何体、落地碰撞、慢放、暂停、反向拖动及重复播放资源复用。
- `npm run test:toon`：角色、进食、小跑、喷水、庭院与手机截图，检查浏览器与着色器错误。
- `npm run build`：Vite 生产构建。

构建保留已有的 JS 体积分包提示。移动端完成画面和兼容性检查，尚未测量真实手机的帧率。

效果图位于 `renders/toon-v06-blender-character.png`、`renders/toon-v06-character.png` 与 `renders/toon-v06-garden.png`。测试记录位于 `docs/toon-source-validation.json`、`docs/toon-v06-browser-tests.json`、`docs/game-resources-browser-tests.json` 与 `docs/water-gun-v05-tests.json`。
