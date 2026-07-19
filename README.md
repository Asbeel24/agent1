# GPU Particle Orb

将原 p5.js / Processing 粒子弹簧动画改写为 Three.js GLSL shader 的实时交互版本。

在线预览：[https://lumina-voice-orb.vercel.app](https://lumina-voice-orb.vercel.app)

## 技术栈

- Vite + React + TypeScript
- Three.js `Points` + 自定义 GLSL Shader
- `GPUComputationRenderer` 双浮点纹理保存位置与速度
- GPU 弹簧回归、阻尼、旋转目标与指针斥力
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

`dist/` 是纯静态产物，可直接部署到 Vercel、Netlify、Cloudflare Pages 或任意静态服务器。构建命令为 `npm run build`，发布目录为 `dist`。
