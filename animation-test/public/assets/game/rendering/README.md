# 日式动画三渲二 v0.6

材质采用三档明暗，以浅暖色受光面、青蓝灰阴影和细深蓝轮廓表现体积。去除物理高光，保留眼睛贴图中画好的亮点。眼睛图集含有蓝色皮肤，和头部使用相同的明暗计算，避免出现方形色块。

角色轮廓使用深蓝 `#294653`，庭院轮廓使用更轻的灰绿 `#49644e`；草地、水面、花朵、玻璃与水花不叠加黑边。描边在渲染时跟随骨骼和顶点变形，不复制游戏里的角色或碰撞体。角色保持原有的 1,676 个顶点、3,344 个三角面、25 根导出骨骼与七段动作。

## Three.js 接入

`toon-style.js` 是 ESM 模块，依赖项目安装的 `three`。传入场景已有的半球光、主平行光和补平行光。模块使用 `MeshToonMaterial` 与 Three.js `OutlineEffect`，沿用原有贴图、UV、顶点颜色、透明度和骨骼。

```js
import {createToonStyle} from './rendering/toon-style.js';

const toon = createToonStyle({renderer,scene,ambient,key,fill});
toon.apply(character.scene,'character');
toon.apply(garden.scene,'environment');
toon.apply(berry.scene,'prop');
// 其他需要统一材质的道具也调用 apply。
// 场景和所有水花初始化后，将其他材质排除在轮廓渲染之外。
toon.excludeUnstyled();
toon.setView('garden'); // 动作预览使用 'stage'

// 每帧：先更新 AnimationMixer 和水花，再渲染。
toon.renderFrame(camera);
```

渲染使用 sRGB 输出、NoToneMapping 与一盏暖白主光，避免亮部发白；天空补光提高阴影亮度。角色外轮廓厚度为屏幕投影比例 0.0018，庭院为 0.00065–0.001。轮廓额外绘制一次所需的网格；移动端已检查取景和材质兼容性，尚未测量真实手机的帧率。

## Blender 编辑源

`source/mudkip-animations.blend` 与项目根目录最新的 `mudkip-toon-v08.blend` 使用 Eevee。身体和眼睛的节点为 Diffuse → Shader to RGB → 三档 Constant ColorRamp → 与原始颜色贴图相乘 → Emission。原 Principled 节点仍保留，便于检查和导出回退。

独立对象 `Mudkip Ink Outline` 使用反向法线、0.0028 米描边宽度及原有骨骼权重；关闭其相机可见性即可移除描边。编辑灯光和 ColorRamp 可直接调整明暗分区。原网格、UV 和权重没有改动。

glTF 不保存 Blender 的 Shader to RGB 节点；运行时通过本模块恢复三渲二表现。动画构建脚本先导出原始贴图材质的 GLB，再配置源文件的 Eevee 材质，避免将不受支持的节点导出为错误颜色。
