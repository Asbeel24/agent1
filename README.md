# Agent1 · BicaMind Presence Interface

以 BicaMind 多场景交互逻辑为基础的实时语音智能界面，包含翻译、主场、会议与人格市场。核心视觉为 Three.js GLSL 驱动的 GPU 粒子球。

## 技术栈

- Vite + React + TypeScript
- Three.js `Points` + 自定义 GLSL Shader
- `GPUComputationRenderer` 双浮点纹理保存位置与速度
- GPU 弹簧回归、阻尼、旋转目标与指针吸引
- CSS 响应式布局与 `prefers-reduced-motion` 降级

## 实现路径

1. 16000 个粒子的三维 position / velocity 分别存入 128 × 128 的 32 位浮点纹理。
2. Compute shader 每帧计算旋转 home 坐标、弹簧吸引、指针斥力、速度阻尼与噪声扩散。
3. position 纹理的 life 通道控制粒子淡入、淡出与重生，重生状态通过 Over 式混合重新写入 feedback 循环。
4. 每次反馈积分后计算粒子到原点的 length，再以 position / length 归一化到固定半径；噪声与交互力只保留球面切向分量。
5. Vertex shader 从位置纹理取样并绘制点，fragment shader 生成白色圆形粒子。
6. Life 通道同时作为粒子实例颜色索引，片元 shader 完成 Level 亮度与 Gamma，再由 Unreal Bloom 后处理产生辉光。
7. 动画参数按 60 Hz 帧时间归一化，在不同刷新率下保持与原程序接近的手感。
8. 监听容器尺寸和 pointer 事件，离开页面时释放 GPU 资源与动画帧。

## 设备性能档位

- 手机：8,000 粒子，30 FPS，DPR 上限 1，Bloom 强度缩放 50%。
- iPad：12,500 粒子，45 FPS，DPR 上限 1.35，Bloom 强度缩放 78%。
- PC：16,000 粒子，60 FPS，DPR 上限 2，完整 Bloom 效果。

## 程序化接口

前后端实时事件、翻译流、任务与会议能力的接口边界见
[`docs/AGENT1_INTERFACE_CONTRACT.md`](docs/AGENT1_INTERFACE_CONTRACT.md)；可编译事件类型见
[`src/protocol/agent1.ts`](src/protocol/agent1.ts)。

### JS API

```js
// 音量范围 0–1，内部会平滑映射到噪声幅度与扰动力
window.particleOrb.setAudioLevel(0.72)

// 横滑范围 -1–1；音量与横滑都只写目标值，由渲染循环平滑
window.particleOrb.setHorizontalInput(-0.35)

// 一次性能量爆发，短时提升速度、扰动和 Bloom
window.particleOrb.trigger('burst', { intensity: 1.2, duration: 0.8 })

// 内置预设：idle / listening / speaking / thinking
window.particleOrb.setPreset('speaking')

// 人格颜色在 1 秒内平滑过渡，不重建材质
window.particleOrb.setPersona({ color: '#74a7ff', transition: 1 })

window.particleOrb.setParams({
  noiseType: 1,
  noiseAmplitude: 0.8,
  particleOpacity: 0.7,
})
```

所有连续输入只更新目标值，渲染循环会在每一帧平滑插值并写入已有 Shader uniform，不会重建材质、几何体或 GPU 反馈纹理。主要方法：

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `setAudioLevel(level)` | `0–1` | 高频音量输入，内部平滑后增加噪声幅度、扰动力和少量 Bloom |
| `setHorizontalInput(value)` | `-1–1` | 高频横滑输入，平滑控制球体旋转方向和速度 |
| `trigger('burst', options)` | `intensity: 0–2`、`duration: 0.1–5s` | 一次性速度、扰动和 Bloom 能量包络，不覆盖当前预设 |
| `setPreset(name)` | `idle/listening/speaking/thinking` | 切换一组全局参数，也支持 `registerPreset` 注册业务预设 |
| `setPersona(options)` | CSS 颜色、过渡秒数 | 在线性渲染颜色上平滑换色，默认 1 秒 |
| `setParams(params)` | 全局参数对象 | 更新噪声、运动、透明度、Level、Bloom 等目标参数 |
| `getState()` | 无 | 返回当前目标参数、音量、横滑、人格颜色、预设和任务光点 |
| `reset()` | 无 | 恢复默认参数并清空任务光点和瞬态能量 |

### 可寻址任务光点

最多支持 8 个独立光点。光点在球体外独立环绕，并与粒子共用 Bloom 后处理。

```js
window.particleOrb.markers.set('task-a', {
  orbitRadius: 1.28,
  phase: 0,
  speed: 0.22,
  tilt: 0.3,
  brightness: 1.6,
  size: 12,
  color: '#ffffff',
})

window.particleOrb.markers.flash('task-a', { intensity: 1.5, duration: 0.45 })
window.particleOrb.markers.remove('task-a')
```

`phase` 以一整圈为 1，`speed` 单位为弧度/秒，`orbitRadius` 是相对球半径。可通过稳定的业务任务 ID 单独寻址。

页面底部的“任务光点测试”Panel 可以一键生成 3 个演示任务，也可以逐颗添加、改色、调整亮度、闪烁和删除；噪声与渲染 Panel 默认收起以避免遮挡外圈轨道。

光点字段：

| 字段 | 范围/单位 | 说明 |
| --- | --- | --- |
| `id` | 1–64 字符 | 稳定的业务任务 ID，也是单独寻址键 |
| `orbitRadius` | `1.05–1.8` | 相对球体半径，必须保持在球体外侧 |
| `phase` | 一整圈为 `1` | 光点在轨道上的相位位置 |
| `speed` | `-2–2 rad/s` | 正负值分别控制两个环绕方向 |
| `tilt` | `-π/2–π/2` | 独立轨道平面的倾角 |
| `brightness` | `0–4` | 基础亮度；闪烁能量会临时叠加在此值上 |
| `size` | `2–32 px` | 光点直径，会根据设备 DPR 自动缩放 |
| `color` | CSS 颜色字符串 | 光点颜色，与球体共用 Bloom 后处理 |

`markers.set(id, options)` 可创建或局部更新；超过 8 个时会抛出明确错误。`markers.list()` 返回当前光点，`markers.clear()` 清空全部光点。

### 调试事件入口

```js
window.__orb.fire('voice', { level: 0.8 })
window.__orb.fire('burst', { intensity: 1.2 })
window.__orb.fire('state', { name: 'thinking' })
window.__orb.fire('persona', { color: '#74a7ff' })
window.__orb.fire('task:add', { id: 'task-a', phase: 0 })
window.__orb.fire('task:progress', { id: 'task-a', progress: 0.6 })
window.__orb.fire('task:complete', { id: 'task-a' })
window.__orb.fire('task:remove', { id: 'task-a' })
```

也支持中文事件名：`音量`、`横滑`、`能量爆发`、`状态切换`、`人格换色`、`新建任务`、`任务有进展`、`任务完成`、`移除任务`。

### postMessage

```js
iframe.contentWindow.postMessage({
  source: 'particle-orb-control',
  version: 1,
  type: 'audio-level',
  payload: { level: 0.72 },
  requestId: 'audio-1042',
}, '*')

iframe.contentWindow.postMessage({
  source: 'particle-orb-control',
  version: 1,
  type: 'trigger',
  payload: { name: 'burst', intensity: 1.2, duration: 0.8 },
}, '*')

iframe.contentWindow.postMessage({
  source: 'particle-orb-control',
  version: 1,
  type: 'set-preset',
  payload: { name: 'listening' },
}, '*')

iframe.contentWindow.postMessage({
  source: 'particle-orb-control',
  version: 1,
  type: 'marker-set',
  payload: {
    id: 'task-a',
    phase: 0,
    orbitRadius: 1.28,
    color: '#79a7ff',
  },
  requestId: 'task-a-create',
}, '*')
```

支持的命令：`set-params`、`audio-level`、`horizontal-input`、`trigger`、`set-preset`、`set-persona`、`marker-set`、`marker-flash`、`marker-remove`、`debug-fire`、`get-state`、`reset`。组件会返回 `ready`、`state`、`paramsChanged`、`triggered`、`markersChanged`、`markerFlashed`、`personaChanged` 和 `error` 事件。接入生产父页后，可通过 `window.particleOrb.setAllowedOrigins([...])` 限制允许控制粒子球的来源。

带 `requestId` 的消息会收到对应状态回执：

```js
window.addEventListener('message', (event) => {
  const message = event.data
  if (message?.source !== 'particle-orb' || message?.version !== 1) return
  if (message.type === 'state') console.log(message.requestId, message.payload)
  if (message.type === 'error') console.error(message.requestId, message.payload.message)
})
```

生产环境应在球体初始化后调用 `setAllowedOrigins(['https://your-app.example'])`，并把示例中的 `'*'` 换成明确的目标 origin。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

### 连接 OpenTars 后端

B Version 的视觉和交互层保持不变，接口层对齐
[`0xdenny218/opentars`](https://github.com/0xdenny218/opentars)。
复制 `.env.example` 后配置 `VITE_OPENTARS_*` 变量即可切换到 live 模式。
完整路由矩阵、鉴权与 AppWS 说明见
[`docs/B_VERSION_API_ALIGNMENT.md`](docs/B_VERSION_API_ALIGNMENT.md)。

如果 OpenTars 源码位于相邻目录，可直接校验当前 Swagger：

```bash
npm run contract:check -- ../opentars/server/swaggerdocs/swagger.json
```

`dist/` 是纯静态产物，可直接部署到 Vercel、Netlify、Cloudflare Pages 或任意静态服务器。构建命令为 `npm run build`，发布目录为 `dist`。
