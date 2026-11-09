# 水枪效果 v0.9

## 水池效果 v0.14.2

当前行为：入水和上岸分别单次播放水花，出水水花略小、略短，并固定在水面接触处。游泳和水枪碰到池面只触发波纹。水花播放器复用两个 Sprite，游泳波纹最多三道，停下后淡去。

当前使用透明逐帧水花，替换 v0.13.1 的平面白色弧线。`cartoon-splash.js` 复用两个 Sprite 与一张 4×4 PNG 图集；PNG/JSON 位于 `fx/textures/`。水花在入水和上岸时单次播放，暂停冻结，结束消失。按帧调整接触锚点，装饰 Sprite 不参与射线拾取。

`createPondWater` 现在是异步工厂，需要 await，参数新增 atlasURL，指向 `fx/textures/cartoon-splash-v14.png`。每帧传入 contacts、actor 的 position / yaw、inWater 和 moving。参考、素材生成方式与完整提示词见项目 docs/cartoon-splash-v14.md。

v0.13.1 的断续白色浪纹与白色线条已由上述图集动画替换，底层高度场扰水和折射继续使用。

`pond-water.js` 导出 `createPondWater({environment,collider})`，用于本庭院导出的 Pond_Water / Pond_Details 网格。调用时需先完成环境世界矩阵更新和 toon 材质转换。初始化替换静态水面材质、隐藏旧波纹并移除西岸两颗石头，保留真正的进出缺口。

每帧调用 `update(delta,{contacts,position,yaw,inWater,moving,stroke})`，contacts 为六个世界坐标接触代理，其 y 值相对水面；position、yaw 为角色的位置与朝向，moving 控制划水触发，stroke 为 0–1 的游泳动作周期。主场景渲染前调用 `prepare(camera)` 采集折射。入水或命中时调用 splash(worldPoint)，暂停 delta=0，场景切换 reset。

`pond-simulation.js` 使用上游 MIT 波浪与排水着色器；保留源码和许可在 fx/vendor。两个小高度场缓冲与一个低分辨率颜色/深度缓冲产生波动与折射，不需要 WebGPU。卡通水花由透明图集单次播放。接入范例见 animation-test/src/resource-preview.js 与 main.js；当前效果说明见项目 docs/cartoon-splash-v14.md。

## 水枪

`water-gun.js` 为 Three.js ESM 模块，依赖宿主项目安装的 `three`。源文件位于 `animation-test/src/water-gun-effect.js`，执行 `npm run assets:prepare` 时复制到本资源包。

v0.9 按白浪头分镜重画水束。奶白色浪头先在前端翻起，触及表面后快速压扁成三瓣水花，尾水收细离口。庭院调用 `update` 时传入嘴部插槽的世界旋转作为第四个参数，水束从张开的双唇之间展开。

v0.8 加宽出水口，用朝向镜头的轮廓绘制水束。浅青色块、蓝灰描边和随水前进的白色弧纹构成水束，撞点用圆润的水花和两色泡沫表现。

v0.7 在浅蓝轮廓内加入随水束前进的手绘感白色短纹。撞点分为贴面的扇形泡沫、两侧的短水花与回落水滴。泡沫按实际接触法线贴合表面，并沿来水的切向展开。

v0.6 将主水束改为单段连续水柱，从细水颈扩开，沿较低的弹道以 13.5 米/秒喷出。高速亮纹和少量细水滴沿水束向前，断水时整股余流收细。命中处先闪出短促白水花，练习靶顺来水方向回弹。`createWaterGunEffect` 支持 `speed` 和 `gravity`，应与瞄准计算使用同一组参数。

效果包括嘴边的起喷水珠、具有粗细起伏的弧形水体、圆润水头、断流后三段余水、七个飞行水滴、四道简洁的卡通水花、四颗溅射水滴、两道淡水纹与短暂湿斑。

v0.4 将水束主体直径加粗至约三倍、喷速从 5 提高至 9 米/秒，并同步放大水头和散滴；落地水花放大 1.55 倍。嘴边采用细水颈，再逐渐展开为较粗的中前段。配色为低饱和浅青灰与白色高光，保持通透和简洁。

落地水花使用浅蓝轮廓和少量白色内弧，四道不等大的水花分两拍快速展开；每道约 0.21 秒后消散，只留下淡水纹。形状具有少量厚度，可以在三维场景中旋转查看。所有形状均在初始化时生成，播放时只改变位置、比例和透明度。

所有几何体和材质创建后复用。不会在每次发射时增加新的 Mesh，也不使用异步计时器；通过动作时间驱动，可以暂停和反向拖动预览。

v0.5 与角色一秒的闭嘴蓄力动作同步：0.33 秒开始出水、0.66 秒停水，水珠在开始前 0.025 秒随张嘴出现。蓄力阶段没有嘴外水团。

v0.9 庭院游戏可调用 `begin(null,null,{defer:true})`，使弹道在第一次 `update()` 到达出水时间时初始化。此时应传入真实嘴部位置和 `solveWaterAim()` 的方向，准备动作不会影响发射瞄准。碰撞回调可额外返回 `targetId`，模块会在 `debug()` 中携带该编号、`firstImpact`、`impactPoint` 和 `time`；宿主仅在第一股水到达时按本发编号计一次命中。原先逐帧预览接口保持可用。

## 接口

```js
import { createWaterGunEffect } from './fx/water-gun.js';

const fx = createWaterGunEffect({
  scene,
  start: 0.33,
  stop: 0.66,
  actionDuration: 1.0,
  resolveImpact(origin, velocity, gravity) {
    // 沿 p(t) = origin + velocity*t - (0, gravity*t*t/2, 0)
    // 和场景碰撞求得首次接触。
    // point、normal 均使用世界坐标，normal 必须归一化。
    return { time: flightTime, point: hitPoint, normal: hitNormal };
  },
});

// 播放 WaterShoot 时调用一次。forward 为嘴部挂点的世界 +Z 方向。
fx.begin(mouthPosition, forward);

// 水枪动作期间每帧更新。actionTime 为动作的局部时间。
fx.update(actionTime, mouthPosition, forward);

// 动作自然结束，角色转回 Idle；保留已喷出的水和落点余波。
fx.finish();
// 后续每帧运行；暂停时 deltaSeconds=0，慢放时同比缩放 delta。
fx.updateTail(deltaSeconds);

// 用户打断动作、切换场景或重新开始时清理旧效果。
fx.cancel();
// 卸载场景时释放资源。
fx.dispose();
```

`start`、`stop`、`actionDuration` 应从 `characters/mudkip/animations.json` 中的 WaterShoot 配置读取。

水流从世界嘴部位置出发，沿发射方向飞行后受到重力下落。撞击水冠、薄水膜、湿斑和水纹按接触表面法线对齐。此模块提供视觉表现，命中扣分、受击、目标选择等游戏规则由宿主负责。

材质使用浅青蓝主体、较深边缘、少量白色高光与半透明混合，包含 Three.js 的色调映射和颜色输出转换。无需额外图片、HDR 或粒子贴图。
