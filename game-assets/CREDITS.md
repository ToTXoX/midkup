# 场景素材来源

v10 场景为 `mudkip-garden-v10-left-pine.blend`，将左侧中间的圆树替换为 Kenney `tree_pineRoundD.glb` 小松树，来源和 CC0 许可见下方记录。

v09 场景为 `mudkip-garden-v09-smaller-tree.blend`，在 v08 基础上仅将左后最大树整体缩小 25%；素材来源与许可沿用下方记录。

## v08 庭院种植构图

- 场景：`mudkip-garden-v08-designed.blend`。
- 设计说明：`docs/planting-design-v08.md`；精确摆位：`docs/planting-plan-v08.json`。
- 可见分组：`Garden Designed Planting v08`。
- 左侧圆树与水边扁圆树：KayKit `Tree_1_A_Color1.gltf`、`Tree_1_B_Color1.gltf`、`Tree_3_A_Color1.gltf`，共 4 棵。
- 树脚灌木：KayKit `Bush_1_A_Color1.gltf`、`Bush_1_C_Color1.gltf`，共 8 处。
- 右后小松树：Kenney `tree_pineRoundD.glb`，共 3 棵。
- 两套资产均为 CC0 1.0；来源页面和原始许可文件见下方对应章节。
- 处理：保留原网格和 UV，统一缩放与朝向；KayKit 植物材质使用原渐变图集，降低饱和度和明度；小松树调整为协调的绿色与暖棕树干。
- 旧版独立树木与散布灌木已隐藏保留。树脚在原地面上增加柔和的草色过渡，没有改变可行走地形。

## KayKit Forest Nature Pack 方案 B

- 作者：Kay Lousberg。
- 官方页面与下载来源：https://kaylousberg.itch.io/kaykit-forest
- 作者介绍页面：https://kaylousberg.com/game-assets/forest-nature-pack
- 使用版本：KayKit Forest Nature Pack 1.0 FREE。
- 许可：CC0 1.0；原始许可文件为 `models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/License.txt`。
- 下载日期：2026-11-03，通过官方页面的免费版下载入口取得。
- 使用模型：`Tree_1_A_Color1.gltf`、`Tree_1_B_Color1.gltf`、`Tree_1_C_Color1.gltf`。
- 本地模型目录：`models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf`。
- 贴图：原包 `forest_texture.png` 渐变图集。
- 本项目处理：保留原版模型、UV、材质与渐变图集，只调整比例、位置和朝向，共布置 4 棵圆润阔叶树。
- v06 试用场景：`mudkip-garden-v06-B.blend`。
- 可见分组：`Village KayKit B Round Trees`；原版源网格保留于隐藏分组 `KayKit B Source Trees`。
- A 方案阔叶树已隐藏，3 棵小松树继续保留。
- v07 混搭：使用 `Tree_3_A_Color1.gltf` 和 `Tree_3_C_Color1.gltf` 两种原版扁圆树，与 `Tree_1_A_Color1.gltf`、`Tree_1_B_Color1.gltf` 两棵圆树搭配，保留 3 棵小松树。只调整统一缩放、位置及朝向。
- v07 混搭场景：`mudkip-garden-v07-mixed.blend`；可见阔叶树分组为 `Village KayKit Mixed Trees`，旧版 B 布局已隐藏保存。

## Quaternius Stylized Tree Pack 方案 A

- 作者：Quaternius。
- 官方页面：https://quaternius.com/packs/stylizedtree.html
- 实际下载来源：作者在 OpenGameArt 发布的同一套模型，https://opengameart.org/content/lowpoly-textured-trees 。
- 原始下载文件：https://opengameart.org/sites/default/files/textured_stylized_trees_-_may_2020.zip
- 许可：CC0 1.0，官方素材页和作者的 OpenGameArt 发布页均有标注。
- 下载日期：2026-11-03。
- 本地素材目录：`models/quaternius-stylized-trees/extracted/Textured Stylized Trees - May 2020`。
- 使用模型：`Tree_1.blend`、`Tree_3.blend`、`Tree_5.blend`、`Tree_7.blend`，共放置 5 棵阔叶树。
- 使用贴图：`Tree_Leaves.png`、`Tree_Bark.jpg`。
- 本项目处理：保留原版几何、UV 与发布的贴图，修复旧版 blend 文件中的贴图路径，统一缩放并调整摆放位置和朝向。
- v05 试用场景：`mudkip-garden-v05-A.blend`。
- 可见分组：`Village Quaternius A Trees`；原版素材位于隐藏分组 `Quaternius A Source Trees`。
- v04 自制阔叶树已经隐藏，3 棵小松树继续保留。

## Kenney Nature Kit

- 作者：Kenney
- 素材包：Nature Kit 2.1
- 官方来源：https://kenney.nl/assets/nature-kit
- 许可：Creative Commons Zero，CC0 1.0。
- 原始许可文件：`models/kenney-nature-kit/extracted/License.txt`。
- 下载日期：2026-11-03。
- v02 使用文件：`tree_detailed.glb`、`tree_oak.glb`、`tree_pineTallA_detailed.glb`、`tree_pineRoundD.glb`。
- 本项目修改：统一为深绿树林配色，规范化模型原点，并以共享网格实例布置在庭院后侧及两侧。
- Blender 分组：`Village Woodland Kenney CC0`；源网格保留于隐藏分组 `Village Tree Source Assets`。
- v03 状态：根据用户对尖锥和方块树冠的反馈，以上分组已隐藏，不参与当前画面渲染。
- v04 状态：保留 3 棵矮小的 `tree_pineRoundD.glb` 松树，调整为自然绿色，与阔叶树搭配；分组为 `Village Small Pines`。

## 圆润庭院树木

- v03 使用本项目重新建模的 8 棵圆润庭院树，降低高度与密度，采用光滑团簇树冠和弯曲树干。
- Blender 分组：`Village Soft Garden Trees`。
- v03 可见树木未使用 Kenney 的树木网格。
- v04 调整：将 5 棵阔叶树的树冠合并成整体，收敛球状团块和过浅的颜色；另外 3 个 v03 圆树实例已隐藏，改为上文注明来源的小松树。

CC0 树木许可不延伸至本项目内的宝可梦角色、用户提供的参考图或其他来源的内容。

## 未白镇风格小屋

- 按用户提供的参考图在 Blender 中单独建模。
- 采用金黄四坡瓦顶、深绿檐口、米色墙面、木门窗框、台阶和信箱。
- 房屋几何不是从原游戏提取的建筑模型，未引入截图上的文字标签或标记。
- Blender 分组：`Village Cottage`。

## 水跃鱼原始模型

- 来源压缩包：`models/mudkip-original/source/3DS - Pokemon X Y - 258 Mudkip.zip`。
- 原包署名：Nintendo、Game Freak、Creatures Inc.；提取者 Random Talking Bush；托管 The Models Resource。
- 原包说明：`models/mudkip-original/extracted/Pokemon XY/Mudkip/Tag.txt`。

## 其他庭院道具

草地地形、浅水池、木栅栏、三种靶子、花草、食物篮与小径均在本项目中建模。

## 水面模拟 v0.13

### 逐帧卡通水花 v0.14

- 动作/风格参考：Dmitry Sarkisov（Gonzila），[Water Splash 2D VFX Animation](https://realtimevfx.com/t/water-splash-2d-vfx-animation/16822)。
- 原作仅作视觉参考，不包含在运行资源包中。图集 `fx/textures/cartoon-splash-v14.png` 由内置 imagegen 重新生成，使用独立图形与透明背景。
- 素材来源、最终提示词、帧信息与接入说明见项目 `docs/cartoon-splash-v14.md`。

- 波浪传播、法线、落水扰动与物体排水 GLSL 来自 [jeantimex/threejs-water](https://github.com/jeantimex/threejs-water)，MIT 许可。
- Original work Copyright (c) 2011 Evan Wallace；Modified work Copyright (c) 2026 Yong Su。
- 上游着色器保留在 `animation-test/src/vendor/water-reference.js`，许可位于同目录 `water-LICENSE.txt`；运行包副本在 `fx/vendor/`。
- 本项目适配椭圆吸收岸界、120 Hz 固定步长、六个骨骼接触代理、小波幅卡通材质及屏幕空间折射。
- 视觉参考：[Cortiz Water Anime](https://stylized.cortiz.dev/water)；动画衔接参考 Nintendo 的《动物森友会》夏日更新演示。未使用这两者的模型、贴图或动画资产。
