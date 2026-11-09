# 庭院交互：舞蹈、移动、游泳与水枪 v0.19

## 点击角色跳舞

庭院中的角色点按随机选择 DanceA / DanceB / DanceC，每三次包含全部三支，前后不重复；一次播放完整一轮后回 Idle。宿主 main.js 在庭院将这些 action 临时设为 LoopOnce，在动作台按 animations.json 恢复原循环设置；finished 事件以 action.loop 判断是否结束。表情仍由 eye-expressions.js 的时间轨道控制，结束或切换时恢复睁眼。

角色点击会停止行走；正在进食时先完成本次进食再跳，水中通过 swimming.leave(callback) 上岸后开始。新移动、果篮、水枪操作、场景切换与重置取消排队请求。连点不重启舞蹈，暂停时点角色继续当前一轮。射线按角色和环境的实际距离判断遮挡，拖动手势即使回到按下位置也不会误触跳舞。

## 游泳

`garden-swimming.js` 导出 `createGardenSwimming`。水面使用 `fx/pond-water.js` 的 `createPondWater({environment,collider})`，返回池塘中心、半径、水面高度与效果接口。先把点击点交给 `swimming.request(point)`，返回 handled=false 时才调用陆地寻路。传入的 walkTo 回调应直接调用陆地寻路，避免再次进入 request。

控制器每帧 update(delta)，通过 onClip 请求 Swim / SwimIdle、onSplash 触发 pondWater.splash。角色由左岸缺口入水；点草地先上岸再走到目的地。水中可以喷水、暂停；点击果篮用 leave(callback) 排队，上岸完成后启动进食。场景切换和重置调用 reset。完整宿主回调接入见 animation-test/src/main.js，参数与参考资料见 docs/pond-swimming-v12.md。

## 水枪练习

右下角水枪技能键始终可直接使用：未选靶子时点按朝角色面前喷水，按住拖动可选择任意方向，松开发射。点靶子是可选的锁定操作；锁定后点按技能键射向靶心，拖动则转回自由瞄准。草地点击始终移动并清除锁定，没有移动／瞄准界面开关。电脑也可用空格直接施放，Esc 取消拖动或清除锁定。手机靶子附近有 36 像素触控区，技能键直径 82 像素。

`water-skill-input.js` 的 `createWaterSkillInput({button,canStart,onStart,onDrag,onRelease,onCancel,onTap})` 统一 Pointer Events。拖动超过 8 CSS 像素后调用 `onDrag({x,y})`；`x,y` 为相对按下位置的屏幕位移。指针捕获保证拖出按钮范围仍可瞄准，松手只调用一次 `onRelease()`。普通点按同样通过 `onStart` / `onRelease` 发射，键盘或辅助技术的 click 通过 `onTap()` 发射，避免触控合成 click 再喷一发。`cancel()`、pointercancel、捕获丢失、窗口失焦和页面隐藏均取消手势。

测试页将拖动方向按当前相机投影到地面，从角色中心取 2.8 米处作为自由喷水点。拖动时只显示准星与按钮附近的圆形触控反馈，不绘制轨迹线；松手后调用 `combat.fire()`，由原有转身与蓄水动作接续。未选目标的快捷发射也在角色前方取 2.8 米。技能键按下时停止移动并暂停相机操作，释放或取消后恢复。暂停、重置、点击草地和切换场景会取消未释放的手势。

准星主体为四角与中心点，没有轨迹线。标签提示可命中、距离太远或被遮挡，拖动技能键时提示松手喷水。远处目标需要先移动靠近，不会自动寻路接近目标。当前三个靶子均静止，滑轨靶的往复移动属于后续工作。

`water-aim.js` 的 `solveWaterAim(origin,point)` 返回 `direction`、`angle`、`range`、`time`、`reachable`。使用与效果相同的初速度 9 米/秒、重力 20 米/秒²，选择低弧线。上限为 4.4 米，实际射程还受目标高度与弹道判别式限制。无法到达时仍可朝该方向喷水，按真实落点处理，不会强制吸附命中。

`garden-combat.js` 的 `createGardenCombat({actor,model,preview,onShoot,onStop,onMessage,onHit})` 提供：

- `setMode('move'|'aim')`、`aimAt(worldPoint,targetId,{predict,silent})`、`fire(paused)`、`cancel()`。mode 仅表示内部状态，界面不提供模式开关；拖动时使用 `{predict:false,silent:true}`，按后续姿态更新节流预测。
- 每帧先调用 `restorePose()` 移除上一帧的头部瞄准偏移，再调用 `update(delta)` 转身及启动单次施法、更新 `AnimationMixer`，最后调用 `pose()` 叠加本帧瞄准。`AnimationMixer` 对未变化的骨骼值会跳过写回，提前恢复基础姿态可避免收尾恒定帧上累积抬头。动作切换与逐帧 seek 前也调用 `restorePose()`；`pose()` 本身可安全重复调用。
- `onShoot(point,id)` 应播放 `WaterShoot` 并把本次点位与编号交给水流系统；`onStop()` 停止移动和旧效果。`onActionChange(name,{completed})` 同步恢复或打断状态；`contact({shotId,targetId,point,time})` 只接收本次发射的真实接触事件。
- `preview.traceWater(origin,direction)` 必须按水流的相同速度、重力和场景几何返回首个接触；`preview.targetPoint(id)` 返回世界靶心。测试页的实现见 `animation-test/src/resource-preview.js`。

游戏发射采用 `water.begin(null,null,{defer:true})`，在动作 0.33 秒真正出水时读取嘴部位置、求解并冻结这一发弹道。此后薄水颈跟随嘴部，已飞出的水保留轨迹。碰撞以 0.02 秒弧线片段对真实模型做射线检测；碰撞点、法线、靶子编号同时供水花与计分使用。只有靶盘、彩环、靶心可计分，底座与立柱不算靶面。第一股水抵达后每发只计一次，选中目标本身不计分。

`target-feedback.js` 的 `createTargetFeedback(records)` 接收 `{id,object,hit:{center,radius}}`，并提供 `hit(id)`、`update(delta)`、`reset()`、`debug()`。靶板和立柱围绕底座上方回弹，底座留在原处；重型靶摆动较小。命中闪光持续 0.33 秒，弹性摆动在 0.8 秒内结束，界面「命中 +1」在 0.75 秒内上浮消失。暂停时传零 delta。材质与几何体在初始化时创建并重复使用。

`npm run test:combat` 检查物理落点、实际点击与空格、准备与飞行阶段、三个靶子、一次计分、打空和墙体、移动打断、暂停、触控及多次施法资源复用。结果写入 `docs/garden-combat-v09-tests.json`。

`npm run test:skill` 检查无需选目标直接发射、鼠标拖动与捕获、释放时单次发射、可选锁定、Esc、暂停、原生触控点按和拖动、touchcancel、恢复移动、Enter/Space 与场景切换。结果为 `docs/water-skill-v10-tests.json`。

## 移动与碰撞

打开 `resources.html?scene=garden` 进入庭院漫游。点击草地后，水跃鱼会转向并沿安全路线移动，到达后切回待机。可切换轻快走和小跑、暂停、回到起点，拖动旋转镜头，滚轮或双指缩放。点到房屋、树干或地面边缘时，终点会调整到附近可到达的草地；点击水池由游泳控制器处理。

走路约 0.66 米/秒，小跑约 1.54 米/秒。走路周期 0.4 秒，跑步周期 0.35 秒；位移和动画播放速度随加减速一致变化。转弯加入最多约 5° 的轻微侧倾，停步后回正。路径在内部用于绕行，画面显示白边薄荷绿落点环，不绘制指示线。

## 接入

`garden-navigation.js` 不依赖 Three.js，可在网页游戏中单独复用。输入位置使用 `{x,z}` 或 `[x,z]`，单位为米。

```js
import {createGardenNavigation,createGardenWalker} from './gameplay/garden-navigation.js';

const navigation=createGardenNavigation(layout,{extraColliders});
const walker=createGardenWalker(navigation);
const plan=walker.start({x:actor.position.x,z:actor.position.z},clickedPoint);
// plan.ok、plan.adjusted、plan.goal 和 plan.waypoints 用于终点与路径跟随。

// 每帧：朝向 walker.waypoint，按 remainingDistance() 规划减速，动画速度与地面速度一致。
const result=walker.advance(actor.position,speed*deltaSeconds);
actor.position.x=result.position.x;
actor.position.z=result.position.z;
// Y 由 NAV_Ground 的实际地表高度 + 0.005 米确定。
// result.finished 时切回 Idle；切换动作或场景时 walker.cancel()。
```

`destination-marker.js` 提供 `createDestinationMarker(scene)`，通过 `show(worldPosition)`、`arrive()`、`hide()` 控制落点；每帧调用 `update(deltaSeconds,camera,viewportHeight)`。圆环主体以约 36 个 CSS 像素为目标，带白边后约 40 像素，自动适配视角和屏幕。点击时弹出并扩散一道细环，等待期间轻微呼吸，到达后在 0.28 秒内收拢淡出。暂停时传入零 delta。几何体和材质在初始化时创建并复用。

22 个关卡障碍包括房屋墙体、13 段栅栏、7 棵主要树木与水池。运行时自动增加三种靶子的占地；测试页根据 `Basket` 网格补充一个树果篮障碍，共 26 个。小草、花朵、低矮灌木作为装饰不参与阻挡。

使用 0.4 米的圆形角色占地与 0.04 米余量；水池额外预留 0.12 米岸边距离。角色尾鳍作为柔性外观，不单独计算刚体碰撞。碰撞沿完整移动线段检测，不依靠仅检查终点，较大的时间步也不会穿越细栅栏或墙体。房屋按矩形、树木和靶子按圆形、水池按外包椭圆多边形计算，并为角色尺寸扩张。

可直接到达时走直线；有障碍时在约 0.16 米网格上进行 A* 寻路，再按精确碰撞检测简化路线。对角移动检查完整线段，避免切过障碍角。不可达的点击位置会改到当前连通区域内的附近位置，不会隔着障碍传送。

`layout.navigation` 保存半径、余量、寻路格距与岸边距离。`walkableBounds` 是地面的保守范围，运行时还会根据角色占地进一步内缩。陆地导航仍将水池视为障碍，游泳控制器在指定岸边独立处理入水、池内移动和出水。尚未包含自由跳跃或移动靶子的动态避障。
