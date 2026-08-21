# Debug Session: remote-inject-bug
- **Status**: [OPEN]
- **Issue**: HARNESS 加载 `dsh-sidehelper` 失败，报错 `cannot get property "remote" without inject`
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-remote-inject-bug.ndjson

## Reproduction Steps
1. 在本地终端进入 `/home/fei/workspace/dsh-sidebar-assistant`
2. 运行 `dsh web`
3. 观察 HARNESS 插件加载阶段报错

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 浏览器端实际加载的入口不是当前导出的 `client` 产物，导致 `inject` 没被读到 | High | Low | Pending |
| B | loader 读取到了 bundle，但只认特定导出形态，当前 bundle 的 `inject` 导出未被识别 | High | Medium | Pending |
| C | `ctx.remote` 的访问发生在 loader 建立注入关系之前，触发了过早读取 | Medium | Low | Pending |
| D | HARNESS 侧实际加载的是旧缓存/旧构建产物，不是当前工作区里的最新 `lib/client.js` | Medium | Low | Pending |
| E | `remote` 不是当前 loader entry 允许直接读取的服务，应该通过别的挂载面拿到 sidehelper RPC | Medium | Medium | Pending |

## Log Evidence
Pending

## Verification Conclusion
Pending
