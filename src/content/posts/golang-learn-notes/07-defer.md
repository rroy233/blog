---
title: "Go defer"
published: 2026-03-05
image: "./assets/covers/defer_cover.webp"
tags: [go, 后端, "defer"]
category: "Golang"
draft: false
series: "Golang学习笔记"
seriesOrder: 7
---
## 一、核心特性

### 1. **执行时机与作用域**

`defer` 传入的函数只会在**当前函数返回**之前被调用，而不是在退出代码块（如 `if` 或 `{}`）时执行。

```go
func main() {
    {
        defer fmt.Println("defer runs")
        fmt.Println("block ends")
    }

    fmt.Println("main ends")
}

$ go run main.go
block ends
main ends
defer runs
```

### 2. 执行顺序（后进先出）
多个 `defer` 语句按照“后进先出”的顺序执行。这是因为底层通过链表实现，新声明的 `defer` 会被插入到链表头部。

比如：
```go
defer A()
defer B()
defer C()
```
后加入的会放在头部，弹出时先弹出
![](./assets/07-defer/pasted-image-20260305162939.png)


### 3. 参数预计算（传值特性）

调用 `defer` 关键字时，**会立刻拷贝函数中引用的外部参数**。
- _经典陷阱_：`defer fmt.Println(time.Since(start))` 会立刻计算时间。
- _Go 1.22+ 更新_：引入了静态检查增强（`go vet`），强制警告这种写法，引导开发者使用闭包。
```go
defer func() { 
	fmt.Println(time.Since(startedAt)) //能按照预期执行
}()
```

### 4. 闭包与循环变量
- _历史陷阱_：在 `for` 循环中使用 `defer` 闭包引用循环变量，会导致所有 `defer` 最终捕获的都是循环结束时的同一个变量。
- _Go 1.22+ 更新_：重构了 `for` 循环语义，每次迭代生成独立的变量实例，从根本上消除了这个饱受诟病的陷阱。

> 同 for-range 笔记

## 二、数据结构
```go
type _defer struct {
	siz       int32 //参数和返回值的内存大小。
	started   bool
	openDefer bool // 标识当前 `defer` 是否经过了**开放编码**优化。
	sp        uintptr //调用方的栈指针（Stack Pointer）。
	pc        uintptr //调用方的程序计数器（Program Counter）。
	fn        *funcval //传入 `defer` 的具体执行函数。
	_panic    *_panic // 表明当前defer是因为某个特定pannic才被触发的
	link      *_defer //指向 Goroutine 延迟调用链表上的下一个元素
}
```

## 三、3种底层机制

> 大多时候用到的是开放编码

### 1、 堆上分配

这是 Go 语言最早期（1.13 之前）处理 `defer` 的唯一方式，也是目前应对复杂场景的“兜底机制”。
- **触发条件：**
    - 当 `defer` 语句处于 `for` 循环中，或者代码极其复杂，不满足栈分配和开放编码的条件时。
- **核心实现机制：**
    - **编译期转换：** 遇到 `defer` 关键字时，编译器会将其转换为对 `runtime.deferproc` 的函数调用；同时会在当前函数的所有返回路径末尾，插入 `runtime.deferreturn` 的调用。
    - **运行时创建：** 执行到 `deferproc` 时，Go 运行时会在**堆上**（或者从 Goroutine/调度器的缓存池中）动态分配一个 `runtime._defer` 结构体。它会保存相关的函数指针（`fn`）、程序计数器（`pc`）、栈指针（`sp`）以及**拷贝**传入的参数。
    - **链表挂载：** 这个新创建的 `_defer` 结构体会被采用“头插法”追加到当前 Goroutine 的 `_defer` 链表最前面（这就是为什么 `defer` 是后进先出 LIFO 的原因）。
    - **运行时执行：** 函数准备退出时，执行 `deferreturn`，它会从 Goroutine 的链表头部依次取出 `_defer` 结构体，通过汇编函数 `jmpdefer` 跳转执行真正的延迟逻辑。
- **性能痛点：** 涉及堆内存的分配与回收、参数的跨内存拷贝以及多次函数上下文切换，开销最大（约 35ns/op）。

---

### 2、 栈上分配

为了减轻堆内存分配和GC的压力，Go 1.13 引入了栈上分配。
- **触发条件：**
    - `defer` 语句在函数体中**最多只执行一次**（例如不在 `for` 循环内）。
    - 且不满足更高级的“开放编码”条件。
- **核心实现机制：**
    - **编译期预分配：** 既然明确知道这个 `defer` 最多只跑一次，编译器就会在**当前函数的执行栈帧（Stack Frame）** 上，直接预留出 `runtime._defer` 结构体所需的内存空间。
    - **运行时绑定：** 运行时不再调用开销较大的 `deferproc`，而是调用轻量级的 `runtime.deferprocStack`。这个函数不需要去堆上申请内存，仅仅是将预先在栈上分配好的 `_defer` 结构体进行字段初始化，并链接到 Goroutine 的 `_defer` 链表上。
- **性能提升：** 虽然还是需要创建结构体和操作链表，但彻底省去了堆内存分配的开销。相比堆分配，性能提升了约 **30%**。

---

### 3、 开放编码（Open Coded）

自Go 1.14，也是现代 Go 代码中最常被触发的机制。

它直接抛弃了运行时的 `_defer` 结构体，将开销降到了最低。

- **触发条件（极其严格）：**
    1. 当前函数内 `defer` 的总数量 **≤ 8 个**。
    2. `defer` 关键字**不能**在循环体内执行。
    3. 当前函数的 `return` 语句数量与 `defer` 语句数量的乘积 **≤ 15 个**。
- **核心实现机制：**
    - **代码内联展开：** 编译器在生成中间代码时，直接把 `defer` 内部要执行的函数逻辑，**硬编码（内联）** 到原函数的每一个 `exit`语句之前。
    - **延迟比特（deferBits）：** 如果 `defer` 是在 `if` 语句里面的，编译期怎么知道运行时要不要执行它呢？Go 在栈上分配了一个 8 比特（1 字节）大小的变量 `deferBits`。
    - **位运算标记：** 每一个比特位代表一个 `defer`。如果运行时执行到了某个 `defer` 的声明处，就使用按位或（`|`）将对应的比特位置为 `1`。在函数返回前，代码会通过位运算检查 `deferBits` 的状态，为 `1` 就执行对应的内联代码，为 `0` 则跳过。
- **性能提升：** 彻底去除了结构体分配、链表操作和 `deferproc` 的函数调用。性能开销从约 35ns 骤降到 **~6ns**，几乎等同于一次普通的函数直接调用，可以说开销被“抹平”了。

> [!NOTE]  以空间换时间
> 1. 开放编码在编译阶段就将所有defer函数**调用指令+参数**内联到每个函数出口上面，每个函数用位运算决定是否执行。编译阶段创建好了空deferbit，在运行时中，遇到一个defer声明，就将对应位置为1。
> 2. 遵循“15法则”，代码不至于膨胀过多。
> 3. Go 编译器在生成底层 SSA中间代码时，会做控制流优化。创建一个**统一的清理与退出代码块（Exit Block）**，把对 `deferBits` 的检查和执行逻辑全放在这里。将函数中所有的 `return` 语句，都底层转换为**跳转指令（JMP）**，跳转到这个统一的 Exit Block。