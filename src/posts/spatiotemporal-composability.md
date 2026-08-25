---
title: 时空可组合性的一种编程范式
date: 2026-08-25 13:02:07
tags: [Cordis, 编程语言, 软件架构, 形式化方法]
description: Cordis 时空可组合性论文《A Programming Paradigm for Spatiotemporal Composability》的完整中文翻译。
cover: /images/spatiotemporal-composability/cover.svg
socialImage: /images/spatiotemporal-composability/cover.png
coverAlt: 时空可组合性示意：组件在时间轴上可恢复，并在空间依赖图中反应式组合
coverLabel: PAPER TRANSLATION · CORDIS
---

::: warning 译者说明
本文是非官方中文翻译。原题为 *A Programming Paradigm for Spatiotemporal Composability*，作者为 Yifan Shi、Wei Zhang、Tianyi Cui，版本为 v8 / Draft of August 13, 2026，对应原仓库 commit `13f28585668a28106b2f53bedada36e45bc1ed3e`。请从 [cordiverse/paper](https://github.com/cordiverse/paper) 获取原文。原仓库未声明许可证，原文与版权归作者所有；如权利人认为本文不宜公开，请联系删除。
:::

<!-- more -->

## 摘要

现代软件——从插件系统到自演化智能体运行框架——日益需要动态组合，但其形式化基础仍未得到充分发展。我们识别出这一问题的两个正交维度：时间可组合性，即在移除组件时完全撤销其副作用的能力；以及空间可组合性，即声明并以反应式方式管理组件间依赖的能力。我们通过将经典的效应与余效概念提升为运行时机制来处理这两个维度。具体而言，我们形式化了可逆效应，其中每个上下文变换都携带一个由运行时追踪的逆变换。我们还形式化了反应式余效，其中上下文的每次变化都会依据组件的余效规约向该组件发出通知。我们将效应上下文和余效上下文统一为单一的上下文类型，由此构成一种编程范式。随后，我们把这些机制结合到组件这一概念中，并给出一种动态组合演算；其元理论将时空可组合性从单个组件推广到由交错运行的组件组成的整个系统。我们在 Cordis 中实现了这些思想。Cordis 是一个时空可组合性元框架，它既提供具有效应追踪和余效解析能力的核心库，也提供支持配置协调与热模块替换（HMR）的声明式组件加载器。

## 1. 引言

组合——由较简单的部分组装出复杂系统——是软件工程的一项基本原则 [1]。传统上，组合是静态的：函数调用、模块导入和类继承在编译时解析，并在整个执行过程中保持不变。然而，现代软件日益需要动态组合，即在运行时加载、卸载和重新配置组件。插件架构 [2] 和自演化智能体运行框架都要求系统能够即时、安全地添加和移除功能；但当前实践依赖粗粒度机制 [3]，这类机制只能通过重启来重新配置，并会丢弃运行时状态。尽管动态组合在实践中愈发重要，但与静态组合已有的丰富形式化框架相比，其理论基础仍未得到充分发展。

### 1.1 可组合性的维度

为刻画动态组合的要求，我们在组合中已得到充分研究的代数层面之外，识别出两个正交维度：

- **时间可组合性**处理时间维度：移除组件时，该组件对共享环境所做的修改必须得到彻底且安全的撤销。这要求追踪组件执行的每一次资源分配、事件注册和状态变更，并保证在移除组件时按序回收这些内容。
- **空间可组合性**处理空间维度：组件必须能够以结构化且可验证的方式声明、发现并解析彼此之间的依赖。这要求管理依赖拓扑，并在依赖发生变化时协调组件生命周期。

在静态情形下，时间可组合性可归结为词法作用域（例如 RAII [4]、bracket 模式 [5]），空间可组合性则可归结为模块导入解析 [6]。在动态情形下，组件会在运行时到来和离开，两个维度都会变得困难得多：时间可组合性必须处理长期存在且有状态的效应，而这些效应的作用域并不受词法边界约束；空间可组合性则必须处理执行期间出现、消失或改变身份的依赖。

### 1.2 动机示例

#### 1.2.1 插件系统

插件系统是动态组合的典型实例。我们以最广泛使用的可扩展集成开发环境之一 Visual Studio Code（VSCode）作为代表性示例。

**时间方面的局限。** VSCode 在一个名为扩展宿主（extension host）的共享进程中运行所有扩展。尽管可以动态安装扩展，但该宿主没有提供在运行时卸载单个扩展代码的机制。一旦某个扩展的 `activate` 函数执行完毕，若要禁用或卸载该扩展，就必须重启整个宿主，从而影响所有已加载的扩展。主题、快捷键绑定和代码片段等纯声明式扩展不包含代码，因此可以自由移除。然而，在按安装量排名前 100 的扩展中，有 87 个包含可执行代码<sup id="note-ref-1-1"><a href="#note-1" aria-label="注 1">1</a></sup>，因而在移除时需要进行上述重启。虽然 VSCode 提供了 `deactivate` 钩子，但它仅在宿主进程终止期间充当优雅关闭回调，因此无法实现在线移除。此外，该钩子将效应的处置与效应的创建（位于 `activate` 中）分离开来，违背了关注点的局部性，也使得完整清理难以验证。

**空间方面的局限。** VSCode 确实提供了 `extensionDependencies`，用于声明扩展之间的依赖，但它很少得到使用：在按安装量排名前 100 的扩展中，只有 7 个通过 `extensionDependencies` 声明了对非内置扩展的依赖。<sup id="note-ref-1-2"><a href="#note-1" aria-label="注 1">1</a></sup> 这种稀少性反映了扩展 API 的形态：该 API 暴露命令、视图和语言功能等固定的表层扩展点。扩展通过这些扩展点向宿主贡献功能，而不是彼此依赖，因此扩展间依赖很少出现。此外，VSCode 的扩展间交互机制没有提供结构化契约：它通过 `vscode.extensions.getExtension(...).exports` 向其他扩展暴露某个扩展的功能，但返回值没有类型（默认为 `any`），因此依赖方无法信赖经过检查的接口。简言之，VSCode 将扩展引导至宿主提供的一组固定扩展点，却没有为扩展彼此依赖提供安全且结构化的方式。

这两个局限并非 VSCode 所独有；它们普遍存在于插件系统中 [2, 7]，只是在程度上有所不同。

#### 1.2.2 自演化智能体运行框架

现代 AI 智能体依赖运行时智能体运行框架 [8–10]。这些系统可以组合多种工具套件 [11] 和执行环境，管理权限与沙箱化，维护会话状态和持久化，提供上下文管理与记忆系统 [12]，编排子智能体及多智能体工作流 [13]，并向用户和自动化系统暴露接口。未来的运行框架或许会在持续处理请求的同时，生成并部署对自身组件的修改。由模型合成的可复用工具，是迈向组件级自我修改的一种范围更窄的前身 [14]。每一次此类修改本身都是动态组合的一个实例。

由于这些修改会持续发生，且只受到有限甚至完全没有人工监督，动态可组合性变得不可或缺。如果没有时间可组合性，每次自我修改都会迫使系统完全重启，从而丢弃所有进程内积累的状态；在如此频繁的修改下，累积的不可用时间将变得十分可观，正在执行的任务也会反复中断；更糟的是，一次有缺陷的自我修改可能会使恢复工作所依赖的进程本身失效。如果没有空间可组合性，每个模块都必须自行检测并适应其所依赖模块的变化，包括这些模块的出现、消失或身份改变，而且只能通过临时拼凑的方式做到这一点；更糟的是，朴素的代码替换策略可能会悄然破坏依赖方，或引入直到重新加载时才暴露的循环依赖。

#### 1.2.3 粗粒度权宜方案

动态可组合性仅受到有限形式化关注的一个原因是，操作系统和容器编排器已经提供了一种粗粒度的替代方案。操作系统在进程粒度上提供时间可组合性；容器编排器 [3] 在服务粒度上提供空间可组合性。实践中，大多数软件通过诉诸这些粗粒度机制来容忍细粒度可组合性的缺失：通过重启进程来处理行为异常的模块，并由容器编排器管理服务依赖。

然而，这种权宜方案代价高昂。在时间方面，每次重启都会丢弃所有进程内积累的状态（例如缓存、连接和部分完成的计算），而重建这些状态需要数秒乃至数分钟 [15]；要在此期间维持可用性，就需要冗余副本，由于无法恢复单个组件而不得不承担额外的资源开销。在空间方面，容器级编排无法表达共享同一地址空间的组件之间的依赖，而且会为原本可通过本地函数调用完成的交互引入网络开销。这两种机制都作用于进程和容器的边界，但现代系统越来越多地在更细粒度上进行组合。这种粒度错配要求一种组合抽象，能够在与组件本身相同的层级上管理效应和依赖。

### 1.3 贡献

动态可组合性的两个维度分别关乎计算如何修改其环境，以及计算如何依赖其环境。这两个方向正是效应系统 [16, 17] 和余效系统 [18, 19] 所形式化的内容：效应为推理环境修改提供形式化词汇，余效则为推理环境要求提供形式化词汇。然而，现有形式化方法将推理局限于针对词法上固定作用域的编译时分析，无法扩展到组件在运行时到来和离开的动态场景。通过将效应提升为可逆的运行时模型，并将余效提升为反应式依赖解析机制，我们为动态可组合性建立了统一的形式化基础；这一基础与编程语言无关，并适用于任何需要动态组合的软件架构。我们作出以下贡献：

1. 我们形式化了可逆效应（第 3.1 节）：每个上下文变换都携带一个由运行时追踪的显式逆变换，而且追踪和恢复都保持组合，因此在移除组件时能够恢复上下文。这建立了局部时间可组合性。
2. 我们形式化了反应式余效（第 3.2 节）：组件以规约的形式声明其所需的余效，而上下文每次发生变化时，都会依据该规约，以激活、停用或中性三种结果之一通知组件。这建立了局部空间可组合性。
3. 我们将效应上下文和余效上下文统一为单一的上下文类型（第 3.3 节）；在这一类型中，余效上的观察等价为效应赋予独立性，由此构成一种编程范式。
4. 我们给出了一种动态组合演算（第 4 节），它将上述两种机制结合到组件这一概念中，并为组件的生命周期配备操作语义。其元理论将时空可组合性从单个组件推广到由交错运行的组件组成的整个系统。
5. 我们在 Cordis 中实现了这些思想（第 5 节）。Cordis 是一个时空可组合性元框架，它既提供通过效应追踪和余效解析来实现形式化模型的核心库，也提供支持配置协调与热模块替换（HMR）的声明式组件加载器。

<p id="note-1" class="footnote-note"><sup>1</sup> 数据于 2026 年 6 月 9 日从 Visual Studio Code Marketplace 获取。 <a href="#note-ref-1-1" aria-label="返回正文注 1">↩</a> <a href="#note-ref-1-2" aria-label="返回正文注 1">↩</a></p>

## 2. 预备知识

本节简要概述效应系统与余效系统——二者是本研究所依托的两大理论支柱。我们假定读者熟悉基本的类型论与范畴论；本节旨在统一记号，并介绍将在第 3 节中被操作化为运行时机制的关键抽象。

### 2.1. 效应

在简单类型 λ 演算（STLC）[20, 21] 中，类型判断 $\Gamma \vdash t : T$ 表示项 $t$ 在上下文 $\Gamma$ 中具有类型 $T$。效应系统对类型加以精化，以描述计算可能产生哪些副作用，从而得到如下形式的判断：

$$
\Gamma \vdash t : T^{\mathrm{effect}}
\tag{1}
$$

这里，结果类型由效应代数中的一个元素标注，该元素描述计算可能产生哪些副作用，从而支持对有状态计算进行组合式推理。这一方法源自 Lucassen 和 Gifford [22]；他们引入了一种区分类型、效应与区域的带种类类型系统，用以发现并行程序中的调度约束。

**单子效应。** Moggi [16] 最早通过单子，以范畴论方式对计算效应建模；Wadler [23] 随后在 Haskell 中推广了这一方法。范畴 $\mathcal{C}$ 上的单子 $(T, \eta, \mu)$ 将带效应的计算封装为类型 $T(A)$ 的值，其中 $\eta : A \to T(A)$ 将纯值提升至单子中，而 $\mu : T(T(A)) \to T(A)$ 则对嵌套计算进行顺序组合。经典实例包括 Maybe 单子（用于部分性）、State 单子（用于可变状态）以及 IO 单子（用于外部交互）。

**代数效应。** Plotkin 和 Power [17, 24] 证明了代数操作可以确定单子，由此建立了一个将效应接口与其实现解耦的框架。效应签名 $\Sigma$ 声明一组操作（例如，用于状态的 $\operatorname{get} : () \to S$ 和 $\operatorname{put} : S \to ()$）；程序可以自由调用这些操作，而无须预先绑定某种特定解释。Plotkin 和 Pretnar [25] 随后引入了效应处理器，通过提供续延语义来解释操作：

$$
\mathbf{handle}\ e\ \mathbf{with}\ \{\operatorname{op}(v, \kappa) \mapsto \ldots\}
\tag{2}
$$

处理器接收操作参数 $v$ 和定界续延 $\kappa$；它可以调用该续延零次、一次或多次，从而在统一框架内支持异常、协程和非确定性 [26]。Koka [27, 28]、Eff [29] 和 OCaml 5 [30] 等语言均采用了代数效应，只是在设计权衡上各有不同。

### 2.2. 余效

与效应对偶，余效系统 [18, 31] 精化的是上下文而非类型，由此得到如下形式的判断：

$$
\Gamma^{\mathrm{coeffect}} \vdash t : T
\tag{3}
$$

这里，上下文由余效代数中的一个元素标注，该元素描述计算需要从其环境中获得什么，例如需要访问的资源、需要持有的权限或需要依赖的服务。效应对程序给世界造成的影响建模，而余效则对世界施加于程序的约束建模。

**余单子余效。** 使用余单子来组织上下文依赖型计算的思想，最早由 Uustalu 和 Vene [32] 提出；他们以对称（半）幺半余单子作为 Moggi 的单子效应框架的对偶，从而刻画数据流、属性求值等概念。Petricek 等人 [18] 在此基础上提出余效，将其作为对上下文依赖关系的一种统一静态分析。余单子 $(D, \varepsilon, \delta)$ 刻画上下文依赖型计算：$\varepsilon : D(A) \to A$ 从上下文中提取当前值，$\delta : D(A) \to D(D(A))$ 则复制上下文以供嵌套访问。Environment 余单子 $D(X) = E \times X$ 对依赖于固定环境 $E$ 的计算建模；Stream 余单子 $D(X) = \mathbb{N} \to X$ 对依赖于时间数据的计算建模。

**分级余效。** 为实现更细粒度的追踪，分级余效系统使用预序半环 $\mathcal{S} = (S, \leq, +, \times, 0, 1)$ 作为余效代数 [33]；这一体系后来由 Gaboardi 等人 [19] 与分级效应统一起来。$S$ 中的元素标注每个变量绑定，以量化其使用情况：$0$ 表示未使用，$1$ 表示线性使用，$n$ 表示有界使用，$\infty$ 表示不受限使用。半环运算分别以顺序方式（$\times$）和并行方式（$+$）组合余效，从而在统一的代数框架 [37] 中支持精确的资源追踪、敏感性分析 [34] 和信息流控制 [35, 36]。

### 2.3. 与动态可组合性的关系

效应系统与余效系统沿两个互补方向组织关于计算的推理：效应描述计算如何修改其环境，余效则描述计算如何依赖其环境。这两个方向分别对应第 1 节所识别出的动态可组合性的两个维度：

- 时间可组合性要求组件对共享环境所做的修改能够在卸载时被撤销。与此相关的是有状态效应，它们会持久地改变该环境；要撤销这样的改变，就要求它存在逆变换。

- 空间可组合性要求组件间依赖能够被声明并以反应式方式管理。这些依赖正是余效所捕获的内容，而对它们进行管理，就相当于将每项依赖与环境所提供的内容逐一解析。

然而，经典的效应系统和余效系统都是静态工具：效应在词法上固定的作用域内被追踪，并由编译时处理器消解；余效标注则依据执行前确定的上下文进行验证。相比之下，动态组合要求这些保证对运行时到来和离开的组件仍然成立，并且面对的是持续演化的上下文。任何固定的词法作用域都无法界定部署之后才加载的插件；任何编译时上下文都无法预见由运行时配置所产生的依赖。

这促使我们转换视角：与其为静态类型系统增加更多标注，不如将效应和余效的概念结构具体化，使运行时能够直接操作它们，从而动态地建立这些系统在静态层面提供的保证。

## 3. 可逆效应与反应式余效

本节将第 2 节介绍的效应与余效概念提升为运行时机制，由此构建动态组合理论。其核心思想是：将承载效应和余效的类型上下文转化为上下文类型，即可由运行时操作、并将上下文本身具体化为一等实体的类型。对于效应类型，我们将其建模为上下文变换与其逆变换组成的配对，从而实现局部时间可组合性。对于余效上下文，我们将其建模为携带依赖信息的类型，从而实现局部空间可组合性。随后，余效上的观察等价为效应提供独立性。这个同时承载效应与余效的统一上下文本身便构成了一种编程范式。

### 3.1. 可逆效应

时间可组合性是指在运行时加载和卸载组件，并且在卸载后将共享环境恢复到组合前状态的能力。这要求组件对环境所做的每一项修改都既可追踪又可恢复。因此，我们将效应建模为类型为 $\Gamma \to \Gamma \times (\Gamma \to \Gamma)$ 的函数：将其应用于当前上下文后，会得到修改后的上下文以及一个显式逆变换。提供这个逆变换使效应能够被撤销，而将它返回给运行时则使效应能够被追踪。我们称此类效应为可逆效应：通过在执行过程中追踪并组合这些逆变换，完整恢复环境便成为一种结构性保证。

#### 3.1.1. 效应上下文

给定任意非纯函数 $f_{\mathrm{impure}} : X \to Y$，我们将其转换为纯函数形式 $f : \Gamma \times X \to \Gamma \times Y$，其中 $\Gamma$ 为上下文，所有可能的副作用均可表示为 $\Gamma$ 上的变换。对于任意固定输入 $x : X$，其诱导映射 $\gamma \mapsto \operatorname{pr}_1(f(\gamma, x))$ 独立于返回值地捕获了 $f$ 的副作用。因此，$\Gamma$ 上的效应属于由变换 $\Gamma \to \Gamma$ 在复合运算 $\circ$ 下构成的幺半群，其中每条幺半群公理都可直接解读为效应的一项性质：

- **封闭性：**两个效应的顺序组合仍然是一个效应；
- **结合性：**复合效应不依赖于括号如何放置；
- **单位元：**$\operatorname{id}_\Gamma$，即 $\Gamma$ 上的恒等函数，是复合运算的单位元。

为了对可撤销的效应建模，我们将每个变换 $f$ 与另一个能够撤销 $f$ 的变换 $g$ 配对，称 $g$ 为 $f$ 的左逆；在本文其余部分中，我们将其简称为逆变换。撤销是单向的：对逆变换的要求只涉及 $g \circ f$，从不涉及 $f \circ g$。变换对自身具有如下乘法运算：

**定义 1.** 上下文变换对的扭曲组合定义为

$$
(f_1, g_1) \circ (f_2, g_2) \coloneqq (f_1 \circ f_2, g_2 \circ g_1).
\tag{4}
$$

与 $\circ$ 本身一样，左操作数后于右操作数起作用，而逆变换则按相反次序累积。该运算使 $(\Gamma \to \Gamma) \times (\Gamma \to \Gamma)$ 成为一个以 $(\operatorname{id}_\Gamma, \operatorname{id}_\Gamma)$ 为单位元的幺半群；它是变换幺半群与其反幺半群的乘积，我们称之为 $\Gamma$ 上的扭曲组合幺半群 $\mathfrak{T}_\Gamma$。

为了在上下文本身之中追踪效应，我们引入如下定义：

**定义 2.** 给定上下文 $\Gamma$，其效应上下文定义为：

$$
\partial\Gamma \coloneqq \Gamma \times (\Gamma \to \Gamma).
\tag{5}
$$

它可以理解为一个二元组 $(\gamma, \varphi)$，其中：

- $\gamma : \Gamma$ 是当前上下文状态；
- $\varphi : \Gamma \to \Gamma$ 是累加器，即迄今为止所执行效应之逆变换的复合，也是将上下文恢复到初始状态的函数。

特别地，初始效应上下文可表示为 $(\gamma_0, \operatorname{id}_\Gamma)$。

我们还记 $\partial^2\Gamma = \partial\Gamma \times (\partial\Gamma \to \partial\Gamma)$，并以此类推，逐层构成这一塔状结构。

由于累加器 $\varphi$ 的存在，在 $\partial\Gamma$ 上执行的所有效应都可以被追踪和恢复。下面给出追踪与恢复的具体构造。

**定义 3.** 在上下文函数对上定义变换 $\operatorname{track}_\Gamma$：

$$
\begin{aligned}
\operatorname{track}_\Gamma
&: (\Gamma \to \Gamma) \times (\Gamma \to \Gamma)
   \to \partial\Gamma \to \partial\Gamma, \\[2pt]
\operatorname{track}_\Gamma
&= (f,g) \mapsto (\gamma,\varphi)
   \mapsto (f(\gamma),\varphi \circ g).
\end{aligned}
\tag{6}
$$

这一变换把前向函数 $f$ 连同候选逆变换 $g$ 转换为效应上下文 $\partial\Gamma$ 上的变换。将 $\operatorname{track}_\Gamma(f,g)$ 应用于状态 $(\gamma,\varphi)$，会用 $f$ 变换 $\gamma$，并把逆变换 $g$ 复合进 $\varphi$（得到 $\varphi \circ g$），从而在上下文中追踪 $f$ 的效应。

**定理 4.** 对每个 $(f,g) \in (\Gamma \to \Gamma) \times (\Gamma \to \Gamma)$，下图均为交换图，即

$$
\operatorname{pr}_1 \circ \operatorname{track}_\Gamma(f,g)
= f \circ \operatorname{pr}_1.
\tag{7}
$$

```text
      f
Γ ─────────→ Γ
↑      ⇓      ↑
pr₁  track   pr₁
│             │
∂Γ ─────────→ ∂Γ
      f′
```

其中 $f' = \operatorname{track}_\Gamma(f,g)$。

**证明.** 对所有 $(\gamma,\varphi) \in \partial\Gamma$，有

$$
\begin{aligned}
(\operatorname{pr}_1 \circ \operatorname{track}_\Gamma(f,g))(\gamma,\varphi)
&= \operatorname{pr}_1(f(\gamma),\varphi \circ g) \\
&= f(\gamma) \\
&= (f \circ \operatorname{pr}_1)(\gamma,\varphi).
\end{aligned}
$$

$\square$

**定理 5.** $\operatorname{track}_\Gamma$ 是从 $\mathfrak{T}_\Gamma$ 到 $\partial\Gamma \to \partial\Gamma$ 的幺半群同态。也就是说：

1. $\operatorname{track}_\Gamma(\operatorname{id}_\Gamma, \operatorname{id}_\Gamma) = \operatorname{id}_{\partial\Gamma}$；
2. 对所有 $(f_1,g_1),(f_2,g_2) \in \mathfrak{T}_\Gamma$，

$$
\operatorname{track}_\Gamma\bigl((f_1,g_1) \circ (f_2,g_2)\bigr)
= \operatorname{track}_\Gamma(f_1,g_1) \circ \operatorname{track}_\Gamma(f_2,g_2).
\tag{8}
$$

**证明.**

1. 单位元被映射为单位元，因为 $\operatorname{track}_\Gamma(\operatorname{id}_\Gamma, \operatorname{id}_\Gamma)(\gamma,\varphi) = (\gamma,\varphi \circ \operatorname{id}_\Gamma) = (\gamma,\varphi)$。
2. 对于乘法，任取 $(\gamma,\varphi) \in \partial\Gamma$：

$$
\begin{aligned}
&\bigl(\operatorname{track}_\Gamma(f_1,g_1)
  \circ \operatorname{track}_\Gamma(f_2,g_2)\bigr)(\gamma,\varphi) \\
&\quad= \operatorname{track}_\Gamma(f_1,g_1)
  (f_2(\gamma),\varphi \circ g_2) \\
&\quad= (f_1(f_2(\gamma)),\varphi \circ g_2 \circ g_1) \\
&\quad= \operatorname{track}_\Gamma(f_1 \circ f_2,g_2 \circ g_1)(\gamma,\varphi).
\end{aligned}
$$

$\square$

**定义 6.** 在 $\partial\Gamma$ 上定义变换 $\operatorname{recover}_\Gamma$：

$$
\begin{aligned}
\operatorname{recover}_\Gamma &: \partial\Gamma \to \partial\Gamma, \\[2pt]
\operatorname{recover}_\Gamma
&= (\gamma,\varphi) \mapsto (\varphi(\gamma),\operatorname{id}_\Gamma).
\end{aligned}
\tag{9}
$$

这一变换把恢复函数 $\varphi$ 应用于当前状态 $\gamma$，并将 $\varphi$ 重置为恒等函数。下图说明：在效应上下文 $\partial\Gamma$ 上依次应用一系列效应 $\operatorname{track}(f_1,g_1), \ldots, \operatorname{track}(f_n,g_n)$ 后，$\operatorname{recover}$ 如何把上下文恢复到初始状态：

```text
       f₁                              fₙ
Γ ───────────→ Γ ┄ ┄ ┄ ┄ ┄ → Γ ───────────→ Γ
      ⇓ track          ⇓ track          ⇓ track
∂Γ ───────────→ ∂Γ ┄ ┄ ┄ ┄ → ∂Γ ───────────→ ∂Γ
       f′₁                             f′ₙ
↑                                          │
└──────────────── recover ─────────────────┘
```

图中，上方每个变换 $f_i$ 经 $\operatorname{track}$ 提升为下方效应上下文上的变换 $f'_i$；完成所有已追踪效应后，$\operatorname{recover}$ 将最终效应上下文送回初始效应上下文。换言之，先执行已追踪的效应、再执行 $\operatorname{recover}$，会使初始效应上下文回到其自身。每一步追踪所保持的，正是从其所处任意状态出发得到的恢复结果本身：

**定理 7.** 对每个 $(\gamma,\varphi) \in \partial\Gamma$ 以及每个满足 $g(f(\gamma)) = \gamma$ 的函数对 $(f,g)$，都有

$$
\operatorname{recover}_\Gamma
\bigl(\operatorname{track}_\Gamma(f,g)(\gamma,\varphi)\bigr)
= \operatorname{recover}_\Gamma(\gamma,\varphi).
\tag{10}
$$

**证明.**

$$
\begin{aligned}
\operatorname{recover}_\Gamma
\bigl(\operatorname{track}_\Gamma(f,g)(\gamma,\varphi)\bigr)
&= \operatorname{recover}_\Gamma(f(\gamma),\varphi \circ g) \\
&= (\varphi(g(f(\gamma))),\operatorname{id}_\Gamma) \\
&= (\varphi(\gamma),\operatorname{id}_\Gamma)
 = \operatorname{recover}_\Gamma(\gamma,\varphi).
\end{aligned}
$$

$\square$

对于一列这样的函数对，无须另行论证。设 $(f_1,g_1), \ldots, (f_n,g_n)$ 从 $(\gamma,\varphi)$ 开始依次应用，并记 $\delta_0 = \gamma$、$\delta_i = f_i(\delta_{i-1})$。根据定理 5，复合
$\operatorname{track}_\Gamma(f_n,g_n) \circ \cdots \circ \operatorname{track}_\Gamma(f_1,g_1)$
就是扭曲组合 $(f_n \circ \cdots \circ f_1, g_1 \circ \cdots \circ g_n)$ 的 $\operatorname{track}_\Gamma$；并且，如果对每个 $i$ 都有 $g_i(\delta_i) = \delta_{i-1}$，那么
$(g_1 \circ \cdots \circ g_n)(\delta_n) = \delta_0 = \gamma$。因此，该函数对在 $\gamma$ 处满足定理 7 的假设，而应用一次该定理即可得到

$$
\operatorname{recover}_\Gamma\Bigl(
  \bigl(\operatorname{track}_\Gamma(f_n,g_n) \circ \cdots \circ
  \operatorname{track}_\Gamma(f_1,g_1)\bigr)(\gamma,\varphi)
\Bigr)
= \operatorname{recover}_\Gamma(\gamma,\varphi).
\tag{11}
$$

取 $(\gamma,\varphi) = (\gamma_0,\operatorname{id}_\Gamma)$，恢复操作便会把以这种方式到达的每个状态都带回 $(\gamma_0,\operatorname{id}_\Gamma)$。满足 $g \circ f = \operatorname{id}_\Gamma$ 的函数对在每个状态上都满足上述假设。

恢复操作通过量 $\varphi(\gamma)$ 读取状态；我们将 $\varphi(\gamma) = \gamma_0$ 称为 $\partial\Gamma$ 中某个状态的健全性不变量。

#### 3.1.2. 可逆效应函数

上一小节的 `track`/`recover` 模型将逆函数视为先验给定：$\operatorname{track}_\Gamma(f,g)$ 在看到任何上下文状态之前就固定了 $g$，因此同一个 $g$ 必须适用于效应所作用的每个状态。然而在实践中，每个效应的逆函数并非先验已知：它必须由调用者在应用效应时提供。此外，`recover` 是全有或全无的：它无法在保留其他效应的同时选择性地撤销某一个效应。为同时解决这两个问题，我们从输入侧和输出侧增强该模型：

1. 在输入侧，我们不仅变换 $\Gamma$，还随之返回一个逆函数，使逆函数在应用效应之处提供：$\Gamma \to \Gamma \times (\Gamma \to \Gamma)$，即 $\Gamma \to \partial\Gamma$；

2. 在输出侧，我们不仅变换 $\partial\Gamma$，还随之返回一个逆函数，从而可以撤销某一个效应而保留其他效应：$\partial\Gamma \to \partial\Gamma \times (\partial\Gamma \to \partial\Gamma)$，即 $\partial\Gamma \to \partial^2\Gamma$。

这一增强在输入与输出之间保持了结构一致性，因此我们仍然可以定义相应的理论，使 `track` 的数学性质得以保持。由此得到效应函数 $\mathfrak{E}_\Gamma$ 及其带见证的精化形式 $\mathfrak{E}^*_\Gamma$：

**定义 8.** 效应函数 $\mathfrak{E}_\Gamma$ 与带见证的效应函数 $\mathfrak{E}^*_\Gamma$ 定义如下：

$$
\begin{aligned}
\mathfrak{E}_\Gamma &\coloneqq \Gamma \to \Gamma \times (\Gamma \to \Gamma), \\
\mathfrak{E}^*_\Gamma &\coloneqq (e : \Gamma \to \Gamma \times (\Gamma \to \Gamma)) \\
&\quad \times \bigl((\gamma : \Gamma) \to ((\delta : \Gamma) \times (g : \Gamma \to \Gamma) \times ((\delta,g)=e(\gamma) \to g(\delta)=\gamma))\bigr).
\end{aligned}
\tag{12}
$$

其中，$e(\gamma)$ 产生一个二元组 $(\delta,g)$，表示：

- $\delta : \Gamma$ 是新的上下文；

- $g : \Gamma \to \Gamma$ 是当前效应的逆函数。

$\mathfrak{E}^*_\Gamma$ 的一个元素针对每个状态选择其逆函数；约束 $g(\delta)=\gamma$ 要求该选择能够在效应的应用位置撤销效应，而不对 $g$ 在其他任何位置的行为施加约束。若存在单一的 $g$ 满足 $g\circ f=\operatorname{id}_\Gamma$，则它会同时在每个状态满足这一约束，并通过映射 $(f,g)\mapsto\gamma\mapsto(f(\gamma),g)$ 诱导出 $\mathfrak{E}^*_\Gamma$ 的一个元素；定理 11 将证明这一映射是一个同态。该约束可由下面的交换图表示，它保证 $e$ 返回的逆函数确实能够逆转 $e$ 在其应用状态处所执行的变换：

$$
\begin{array}{ccc}
\Gamma & \underset{g}{\stackrel{f}{\rightleftarrows}} & \Gamma \\
{}_{e}\searrow & \operatorname{pr}_2\Uparrow & \nearrow_{\operatorname{pr}_1} \\
& \partial\Gamma &
\end{array}
$$

由于效应函数 $\mathfrak{E}_\Gamma$ 不再是上下文上的自同态，因此无法直接进行组合。为此，我们为效应组合定义一种新的运算：

**定义 9.** 给定函数 $f,g\in\mathfrak{E}_\Gamma$，其效应组合 $f\diamond g$ 定义为：

$$
\begin{aligned}
f\diamond g &:\Gamma \to \partial\Gamma, \\
f\diamond g &= \gamma \mapsto
\mathbf{let}\;(\delta,s)=g(\gamma)\;\mathbf{in} \\
&\qquad \mathbf{let}\;(\varepsilon,t)=f(\delta)\;\mathbf{in} \\
&\qquad (\varepsilon,s\circ t).
\end{aligned}
\tag{13}
$$

**定理 10.** 效应组合将 $\mathfrak{T}_\Gamma$ 的幺半群结构传递到 $\mathfrak{E}_\Gamma$ 上。即：

1. $(\mathfrak{E}_\Gamma,\diamond)$ 是一个幺半群，其单位元为 $\eta_\Gamma\coloneqq\gamma\mapsto(\gamma,\operatorname{id}_\Gamma)$；

2. 赋值 $(f,g)\mapsto\gamma\mapsto(f(\gamma),g)$ 是从 $\mathfrak{T}_\Gamma$ 到 $\mathfrak{E}_\Gamma$ 的幺半群同态。

**证明。**

1. 结合律和单位元律逐分量地由 $\circ$ 的相应性质推出。

2. 记 $e_i=\gamma\mapsto(f_i(\gamma),g_i)$；则

   $$
   (e_1\diamond e_2)(\gamma)=(f_1(f_2(\gamma)),g_2\circ g_1),
   $$

   这正是 $(f_1,g_1)\circ(f_2,g_2)$ 的像，而 $(\operatorname{id}_\Gamma,\operatorname{id}_\Gamma)$ 映射到 $\eta_\Gamma$。

$\square$

**定理 11.** 见证性在效应组合下得以保持，并且一个统一的逆函数能够在每个状态提供见证。即：

1. $\mathfrak{E}^*_\Gamma$ 是 $\mathfrak{E}_\Gamma$ 的子幺半群；

2. 定理 10 中的同态将每个满足 $g\circ f=\operatorname{id}_\Gamma$ 的二元组映入 $\mathfrak{E}^*_\Gamma$。

**证明。**

1. 因为 $\operatorname{id}_\Gamma(\gamma)=\gamma$，所以单位元属于 $\mathfrak{E}^*_\Gamma$。对于封闭性，取 $f,g\in\mathfrak{E}^*_\Gamma$ 以及任意 $\gamma\in\Gamma$，并令 $(\delta,s)=g(\gamma)$、$(\varepsilon,t)=f(\delta)$，于是 $(f\diamond g)(\gamma)=(\varepsilon,s\circ t)$。此时 $s(\delta)=\gamma$ 且 $t(\varepsilon)=\delta$，因此 $(s\circ t)(\varepsilon)=s(\delta)=\gamma$。

2. $g\circ f=\operatorname{id}_\Gamma$ 给出每个 $\gamma$ 处的 $g(f(\gamma))=\gamma$，所以这种二元组的像在每个状态都有见证。

$\square$

正如 `track` 将 $\Gamma$ 上的一对变换提升到 $\partial\Gamma$，我们定义 `effect`，将 $\mathfrak{E}_\Gamma$ 提升到 $\mathfrak{E}_{\partial\Gamma}$：

**定义 12.** 效应函数变换 $\operatorname{effect}_\Gamma$ 定义为：

$$
\begin{aligned}
\operatorname{effect}_\Gamma
&: \mathfrak{E}_\Gamma \to \partial\Gamma \to \partial^2\Gamma, \\
\operatorname{effect}_\Gamma
&= e \mapsto (\gamma,\varphi) \mapsto
\mathbf{let}\;(\delta,g)=e(\gamma)\;\mathbf{in} \\
&\qquad ((\delta,\varphi\circ g),\operatorname{track}_\Gamma(g,\operatorname{pr}_1\circ e)).
\end{aligned}
\tag{14}
$$

由于 $\operatorname{effect}_\Gamma(e)$ 本身属于 $\mathfrak{E}_{\partial\Gamma}$，它返回的是将定义 8 提升一个层级后所指意义上的逆函数。这个逆函数本身是对交换效应两个方向后所得二元组的一次 `track`。通常的追踪规则再次适用：撤销该效应本身也是一个效应，它通过 $g$ 变换状态；而撤销这一撤销的方式则是再次执行原效应，这正是 $\operatorname{pr}_1\circ e$ 所做的。因此，该逆函数会完全按照 `track` 的规定，组合到传给它的累加器上。

现在，我们可以证明 `effect` 具有与 `track` 类似的性质。

**定理 13.** `effect` 保持 $\diamond$ 运算。即，对于所有 $f,g\in\mathfrak{E}_\Gamma$：

$$
\operatorname{effect}_\Gamma(f)\diamond\operatorname{effect}_\Gamma(g)
=\operatorname{effect}_\Gamma(f\diamond g).
\tag{15}
$$

**证明。** 取任意 $(\gamma,\varphi)\in\partial\Gamma$，并令 $(\delta,s)=g(\gamma)$、$(\varepsilon,t)=f(\delta)$，于是 $(f\diamond g)(\gamma)=(\varepsilon,s\circ t)$，且

$$
\operatorname{pr}_1\circ(f\diamond g)
=(\operatorname{pr}_1\circ f)\circ(\operatorname{pr}_1\circ g).
$$

那么

$$
\begin{aligned}
&(\operatorname{effect}_\Gamma(f)\diamond\operatorname{effect}_\Gamma(g))(\gamma,\varphi) \\
&=\bigl((\varepsilon,\varphi\circ s\circ t),
\operatorname{track}_\Gamma(s,\operatorname{pr}_1\circ g)
\circ\operatorname{track}_\Gamma(t,\operatorname{pr}_1\circ f)\bigr) \\
&=\bigl((\varepsilon,\varphi\circ s\circ t),
\operatorname{track}_\Gamma(s\circ t,(\operatorname{pr}_1\circ f)\circ(\operatorname{pr}_1\circ g))\bigr) \\
&=\operatorname{effect}_\Gamma(f\diamond g)(\gamma,\varphi).
\end{aligned}
$$

其中，第一步分别在 $(\gamma,\varphi)$ 和 $(\delta,\varphi\circ s)$ 处展开定义 12，第二步使用定理 5，第三步则重新折叠为定义 12。

$\square$

下图展示了这两个层级之间的关系。上方三角形是定义 8 所给出的 $e$ 的见证条件；下方三角形则提出了这样一个问题：$e'$ 是否也以与 $e$ 相同的方式得到见证。

$$
\begin{array}{c}
\begin{array}{ccc}
\Gamma & \underset{g}{\stackrel{f}{\rightleftarrows}} & \Gamma \\
{}_{e}\searrow & \operatorname{pr}_2\Uparrow & \nearrow_{\operatorname{pr}_1} \\
& \partial\Gamma &
\end{array}
\\[-2pt]
\scriptstyle \operatorname{effect}\;\Downarrow
\\[-2pt]
\begin{array}{ccc}
\partial\Gamma & \underset{g'}{\stackrel{f'}{\rightleftarrows}} & \partial\Gamma \\
{}_{e'}\searrow & \operatorname{pr}_2\Uparrow & \nearrow_{\operatorname{pr}_1} \\
& \partial^2\Gamma &
\end{array}
\end{array}
$$

在两个层级之间，投影 $\operatorname{pr}_1$ 将每个提升后的映射与其所提升的映射联系起来，正如定理 4 中 $\operatorname{track}_\Gamma$ 的情形一样。

**定理 14.** 令 $e\in\mathfrak{E}_\Gamma$，记 $f\coloneqq\operatorname{pr}_1\circ e$，并令 $e'\coloneqq\operatorname{effect}_\Gamma(e)$，其前向映射为 $f'\coloneqq\operatorname{pr}_1\circ e'$。则：

1. $\operatorname{pr}_1\circ f'=f\circ\operatorname{pr}_1$；

2. 对每个 $(\gamma,\varphi)\in\partial\Gamma$，提升后的逆函数 $g'\coloneqq\operatorname{pr}_2(e'(\gamma,\varphi))$ 与在该处作为见证的逆函数 $g\coloneqq\operatorname{pr}_2(e(\gamma))$ 满足 $\operatorname{pr}_1\circ g'=g\circ\operatorname{pr}_1$。

**证明。**

1. 由定义 12，$f'(\gamma,\varphi)=(f(\gamma),\varphi\circ g)$，其状态为 $f(\gamma)=(f\circ\operatorname{pr}_1)(\gamma,\varphi)$。

2. 这就是将定理 4 应用于 $g'=\operatorname{track}_\Gamma(g,f)$。

$\square$

通过计算提升后的逆函数返回什么，即可确定下方三角形是否闭合：

**定理 15.** 令 $e\in\mathfrak{E}^*_\Gamma$，并记 $f\coloneqq\operatorname{pr}_1\circ e$。固定 $(\gamma,\varphi)\in\partial\Gamma$，令 $(\delta,g)=e(\gamma)$，并将 $\operatorname{effect}_\Gamma(e)$ 在 $(\gamma,\varphi)$ 处的值记为 $(\Delta,g')$。则

$$
g'(\Delta)=(\gamma,\varphi\circ g\circ f).
\tag{16}
$$

状态被精确恢复。当且仅当 $g\circ f=\operatorname{id}_\Gamma$ 时，累加器也得到恢复；等价地，$\operatorname{effect}_\Gamma(e)\in\mathfrak{E}^*_{\partial\Gamma}$。而且在所有情形下，都有 $(\varphi\circ g\circ f)(\gamma)=\varphi(\gamma)$，因此健全性不变量得以保持。

**证明。** 由定义 12，$\Delta=(\delta,\varphi\circ g)$ 且 $g'=\operatorname{track}_\Gamma(g,f)$，所以

$$
g'(\Delta)=(g(\delta),\varphi\circ g\circ f)
=(\gamma,\varphi\circ g\circ f),
$$

这里使用了 $g(\delta)=\gamma$。属于 $\mathfrak{E}^*_{\partial\Gamma}$ 要求它在每个输入处都等于 $(\gamma,\varphi)$；取 $\varphi=\operatorname{id}_\Gamma$，累加器相等便化为 $g\circ f=\operatorname{id}_\Gamma$；反过来，该条件也会使累加器对每个 $\varphi$ 都相等。最后，

$$
(\varphi\circ g\circ f)(\gamma)=\varphi(g(\delta))=\varphi(\gamma).
$$

$\square$

因此，只有当在 $\gamma$ 处作为见证的逆函数能够在每个状态撤销 $f$ 时，下方三角形才会闭合；所以 $\operatorname{effect}_\Gamma$ 并不会将 $\mathfrak{E}^*_\Gamma$ 映入 $\mathfrak{E}^*_{\partial\Gamma}$。在所有情形下成立的是二者在 $\gamma$ 处相符：

$$
\operatorname{recover}_\Gamma(g'(\Delta))
=\operatorname{recover}_\Gamma(\gamma,\varphi),
$$

这正是定理 7 对累加器所作假设的全部内容，因此撤销操作不会改变恢复目标。

若按照效应应用顺序的逆序来撤销效应，则不需要任何额外条件，因为每个逆函数此时都会遇到由其自身对应的应用所产生的状态：

**定理 16.** 设 $e_1,\ldots,e_n\in\mathfrak{E}^*_\Gamma$ 从 $(\gamma_0,\operatorname{id}_\Gamma)$ 开始依次应用，并按照相反顺序撤销。则：

1. 每次撤销都会恢复到其对应应用运行时所面对的上下文状态；

2. 每个中间状态都满足健全性不变量。

**证明。** 每一步都是一次应用或一次撤销。一次应用把 $(\gamma,\varphi)$ 变为 $(\delta,\varphi\circ g)$，其中 $g(\delta)=\gamma$；因此，由定理 7 可知，它保持 $\varphi(\gamma)$，而定理 7 的假设恰好就是 $\mathfrak{E}^*_\Gamma$ 的见证条件。按照相反顺序撤销时，每个逆函数都会接收到由其自身对应应用所产生的状态，因此由定理 15 可知，该次撤销会精确恢复前一个状态，并且同样保持 $\varphi(\gamma)$；这两个结论都不依赖于该逆函数所接收的累加器。

$\square$

#### 3.1.3. 效应的独立性

定理 16 讨论的是在某个效应自身的应用所产生的状态处撤销该效应；本小节则讨论在任意其他状态处撤销效应。后一种情形有两类需求。其一，在后续效应仍然存在时就可能运行某个逆函数，这正对应于从运行中的系统撤回一个组件；其二，一个序列可能交错执行多个组件的效应，每个组件分别保存自己的逆函数，因而某一组件的各次逆操作会被另一组件的应用隔开。在这两种情况下，逆函数都会遇到已被外来效应移动过的状态；它是否仍能撤销当初为之构造的那个效应，取决于交换性：一个效应所能执行的每种变换，都必须与另一个效应所能执行的每种变换交换，其中既包括前向映射，也包括所产生的逆函数。单一的累加器无法解决这两种情形中的任何一种，因为 $\varphi$ 是一个复合映射，它只能按某一种顺序一次性运行其持有的全部逆函数。

**定义 17.** 对于效应函数 $e\in\mathfrak{E}_\Gamma$，变换幺半群 $\mathfrak{M}(e)$ 是由 $e$ 的前向映射以及 $e$ 所产生的每个逆函数生成的 $\Gamma\to\Gamma$ 的子幺半群；$\mathfrak{M}(e)$ 的生成元就是该生成集中的元素：

$$
\mathfrak{M}(e)
\coloneqq
\left\langle
\{\operatorname{pr}_1\circ e\}
\cup
\{\operatorname{pr}_2(e(\gamma))\mid\gamma\in\Gamma\}
\right\rangle.
\tag{17}
$$

由二元组 $(f,g)\in\mathfrak{T}_\Gamma$ 诱导出的效应以 $f$ 和 $g$ 为其生成元，因为它在每个状态产生的逆函数都是 $g$。

**引理 18.** 交换性可由生成元确定，而 $\diamond$ 不会扩大任何变换幺半群。即：

1. 如果 $\mathfrak{M}(e_1)$ 的每个生成元都与 $\mathfrak{M}(e_2)$ 的每个生成元交换，那么 $\mathfrak{M}(e_1)$ 的每个元素都与 $\mathfrak{M}(e_2)$ 的每个元素交换；

2. $\mathfrak{M}(e_1\diamond e_2)\subseteq\left\langle\mathfrak{M}(e_1)\cup\mathfrak{M}(e_2)\right\rangle$。

**证明。**

1. 与 $\mathfrak{M}(e_2)$ 的每个生成元交换的映射构成 $\Gamma\to\Gamma$ 的一个子幺半群，因为 $\operatorname{id}_\Gamma$ 属于其中，并且只要 $f$ 和 $f'$ 属于其中，$f\circ f'$ 也属于其中。根据假设，该子幺半群包含 $\mathfrak{M}(e_1)$ 的生成元，因此包含 $\mathfrak{M}(e_1)$。固定 $f\in\mathfrak{M}(e_1)$ 后，与 $f$ 交换的映射同样构成一个子幺半群；它包含 $\mathfrak{M}(e_2)$ 的生成元，因此包含 $\mathfrak{M}(e_2)$。

2. 根据定义 9，$e_1\diamond e_2$ 的前向映射为 $(\operatorname{pr}_1\circ e_1)\circ(\operatorname{pr}_1\circ e_2)$；它在任意状态产生的逆函数均为 $s\circ t$，其中 $s$ 由 $e_2$ 产生，$t$ 由 $e_1$ 产生。因此，$\mathfrak{M}(e_1\diamond e_2)$ 的每个生成元都是这两个效应的生成元的复合。

$\square$

**定义 19.** 当满足以下条件时，称效应函数 $e_1,e_2\in\mathfrak{E}_\Gamma$ 相互独立：

1. 一方的每个变换都与另一方的每个变换交换：

   $$
   \forall f\in\mathfrak{M}(e_1),\;g\in\mathfrak{M}(e_2).
   \qquad f\circ g=g\circ f.
   \tag{18}
   $$

2. 任何一方的变换都不会扰动另一方所产生的逆函数：

   $$
   \forall g\in\mathfrak{M}(e_2),\;\gamma\in\Gamma.
   \qquad
   \operatorname{pr}_2(e_1(g(\gamma)))
   =\operatorname{pr}_2(e_1(\gamma)),
   \tag{19}
   $$

   并且交换 $e_1$ 与 $e_2$ 后的同一条件也成立。

如果对于每个 $l\ne l'$，$e_l$ 与 $e_{l'}$ 都相互独立，则称族 $(e_l)_{l\in L}$ 两两独立。一个族可以重复包含同一个效应函数；要求某个效应函数与其自身独立，就是要求 $\mathfrak{M}(e)$ 是交换的。

对于由二元组 $(f_1,g_1)$ 和 $(f_2,g_2)$ 诱导出的效应，根据引理 18(1)，条件 (1) 就是要求以下四对映射分别交换：$f_1,f_2$；$g_1,g_2$；$f_1,g_2$；以及 $g_1,f_2$。条件 (2) 则直接成立，因为诱导效应在每个状态都会产生同一个逆函数。$\diamond$ 下的交换性是另一种不同的性质。等式 $e_1\diamond e_2=e_2\diamond e_1$ 所等同的是两种顺序下的复合前向映射，以及两种顺序下的复合逆函数；在每个复合中，每个逆函数都是在其对应应用自身所产生的状态处加入复合的。相比之下，独立性要求一个效应的每个变换都与另一个效应的每个变换相关联，其中还包括前向映射与外来逆函数之间的配对。

在独立性成立时，可以在后续效应已经移动过的状态处运行某个逆函数；它在该处撤回的恰好是自身的贡献，而不会撤回任何其他贡献：

**定理 20.** 设 $e_1,\ldots,e_n\in\mathfrak{E}^*_\Gamma$ 两两独立，并从 $\gamma_0$ 开始依次应用。记 $f_i\coloneqq\operatorname{pr}_1\circ e_i$，令 $\delta_i\coloneqq f_i(\delta_{i-1})$，其中 $\delta_0\coloneqq\gamma_0$；再令 $g_i\coloneqq\operatorname{pr}_2(e_i(\delta_{i-1}))$，即 $e_i$ 在其应用位置产生的逆函数。固定 $j$，并将省略 $e_j$ 后所得序列的状态记为

$$
\delta'_i\coloneqq(f_i\circ\cdots\circ f_{j+1})(\delta_{j-1}),
$$

因此 $\delta'_j=\delta_{j-1}$。那么，对于每个满足 $j\leq u\leq n$ 的 $u$：

1. $\delta_u=f_j(\delta'_u)$ 且 $g_j(\delta_u)=\delta'_u$；

2. 每个满足 $i>j$ 的 $e_i$ 在 $\delta'_{i-1}$ 处产生的逆函数，与它在 $\delta_{i-1}$ 处产生的逆函数 $g_i$ 相同。

**证明。**

1. 第一个等式可对 $u$ 作归纳证明。当 $u=j$ 时，该等式为 $\delta_j=f_j(\delta_{j-1})$，这正是 $\delta_j$ 的定义。对于归纳步骤，

   $$
   \begin{aligned}
   \delta_{u+1}
   &=f_{u+1}(\delta_u) \\
   &=f_{u+1}(f_j(\delta'_u)) \\
   &=f_j(f_{u+1}(\delta'_u)) \\
   &=f_j(\delta'_{u+1}),
   \end{aligned}
   $$

   其中中间的等式使用了定义 19 的条件 (1)，应用于 $e_{u+1}$ 和 $e_j$；由于 $u+1>j$，它们是该族中两个不同位置的效应。对于第二个等式，条件 (1) 使 $g_j$ 可以向外穿过 $e_j$ 之后应用的各个前向映射，从而最终能够在 $e_j$ 的见证条件所适用的唯一状态处使用该见证：

   $$
   \begin{aligned}
   g_j(\delta_u)
   &=(g_j\circ f_u\circ\cdots\circ f_{j+1})(\delta_j) \\
   &=(f_u\circ\cdots\circ f_{j+1})(g_j(f_j(\delta_{j-1}))) \\
   &=\delta'_u,
   \end{aligned}
   $$

   最后一个等式依据的是 $g_j(f_j(\delta_{j-1}))=\delta_{j-1}$，这正是定义 8 要求 $e_j$ 在 $\delta_{j-1}$ 处满足的见证条件。

2. 由 (1)，状态 $\delta_{i-1}$ 为 $f_j(\delta'_{i-1})$，且 $f_j \in \mathfrak{M}(e_j)$，因此，定义 19 中关于 $e_i$ 和 $e_j$ 的条款 (2) 给出

$$
\operatorname{pr}_2\bigl(e_i(f_j(\delta'_{i-1}))\bigr)
= \operatorname{pr}_2\bigl(e_i(\delta'_{i-1})\bigr).
$$

□

条款 (1) 确定了一个逆函数所到达的状态：无论在该效应之后又应用了哪些效应，这一状态都与从未应用该效应时，同一序列本会到达的状态相同。条款 (2) 确定了其他效应的逆函数在该状态下是什么；二者结合起来，便可将该定理再次应用于更短的序列：

**推论 21.** 设 $e_1, \dots, e_n \in \mathcal{E}^{*}_{\Gamma}$ 两两独立，并从 $\gamma_0$ 开始依次应用；设 $g_1, \dots, g_n$ 如上所述。按照 $\{1, \dots, n\}$ 的任意一个排列所给出的顺序，在 $\delta_n$ 处应用这 $n$ 个逆函数，都会到达 $\gamma_0$。

**证明。** 对 $n$ 作递降归纳。设该排列以 $j$ 开头。根据定理 20(1)，在 $\delta_n$ 处应用 $g_j$ 会到达 $\delta'_n$，即省略 $e_j$ 后的序列所到达的状态；根据定理 20(2)，其余效应在该状态下给出的逆函数，恰好就是当前已有的 $g_i$。由于该序列是原序列的一个子族，因而仍然两两独立，所以归纳假设适用于该序列以及排列中余下的部分；空序列到达 $\gamma_0$。

□

LIFO 顺序正是这样的排列之一，而定理 16 在完全不需要任何假设的情况下就能按该顺序进行还原。独立性带来的是其余所有顺序，并由此能够处理多个组件的效应彼此交错形成的序列；第 4.4.2 节将这一结论提升到整个系统的迹。

这些构造共同组成了可逆效应：$\mathcal{E}^{*}_{\Gamma}$ 中的每个效应函数都显式提供自己的逆函数，$\operatorname{effect}$ 在效应上下文 $\partial \Gamma$ 上追踪这些逆函数，而 $\diamond$ 运算则在保持可逆性的同时对它们进行组合。它们所提供的是局部时间可组合性；所谓“局部”，是指这一保证是就单个组件自身的效应来考察的。我们采用如下判据：对于组件所应用的每一个效应函数序列，累加器都能恢复该序列开始时的上下文（定理 7）；而还原该序列时，每个逆函数都会得到其对应应用原本执行时所面对的状态（定理 16）。加载组件，就是应用这样的序列，并将其逆函数累积到 $\varphi$ 中；卸载组件，就是应用 $\varphi$。

这一判据遗漏了两件事，而二者都会在多个组件共同参与时出现：不按累加器规定的顺序进行还原，以及一个与其他组件的效应彼此交错的序列。独立性提供了这两项能力（推论 21）；它是施加于效应的条件，而非该构造本身的性质。第 3.3.2 节将找出满足这一条件的约束规则，第 4.4.2 节则会就整个系统的迹来陈述这一保证。当独立性不成立时，顺序必须由其他地方承载：在单个组件内部，由累加器承载；无论效应为何，它都会按 LIFO 顺序进行还原（第 4.3.2 节）；而在组件之间，则由已声明的余效承载，它规定一次激活相对于另一次激活的顺序（第 4.3.1 节）。

### 3.2. 反应式余效

空间可组合性，是指组件能够声明彼此之间的依赖，并且系统能够在运行时解析、提供和撤回这些依赖。为此，每当共享上下文发生变化时，都必须重新求值依赖的满足情况，使组件在其依赖变得可用时激活，并在这些依赖被撤回时停用。因此，我们将组件的依赖建模为一个规约，并依据该规约将上下文的每次变化分类为激活型、停用型或中性。依据规约进行分类，负责检测满足状态的变化；响应分类结果，则负责驱动激活与停用。我们将这样的余效称为反应式余效：通过对上下文变化进行分类，并据此驱动激活与停用，正确的余效顺序便成为一种结构性保证。

#### 3.2.1. 余效上下文

传统的控制反转（IoC）容器 [38] 通常将依赖建模为简单的键值映射。本节将 IoC 形式化为一种余效上下文；它与可逆效应协同作用，为动态组合提供数学基础。

**定义 22.** 给定类型族 $\mathcal{V} : K \to \mathsf{Type}$，将余效上下文定义为如下依赖偏函数类型：

$$
\Sigma \coloneqq (k : K) \rightharpoonup \mathcal{V}_k
\tag{20}
$$

其中，$\sigma : \Sigma$ 是一个有限偏函数，它为每个 $k \in \operatorname{dom}(\sigma) \subseteq K$ 指派一个类型为 $\mathcal{V}_k$ 的值。我们采用如下记法：

- $\sigma(k)$ 表示函数应用（当 $k \in \operatorname{dom}(\sigma)$ 时有定义）；

- $\sigma[k \mapsto v]$ 表示在 $k$ 处绑定 $v$、在其他位置均与 $\sigma$ 一致的表；

- $\sigma \setminus k$ 表示限制操作（当 $k \in \operatorname{dom}(\sigma)$ 时有定义）；

- $k \in \operatorname{dom}(\sigma)$ 表示成员关系。

使用类型族 $\mathcal{V}$ 可以确保每个依赖键 $k$ 都关联到特定的值类型 $\mathcal{V}_k$，从而为依赖访问提供静态类型安全。扩展与限制操作带有由下述操作施加的前置条件：一个依赖不能被提供两次（扩展要求 $k \notin \operatorname{dom}(\sigma)$），也不能在不存在时被撤回（限制要求 $k \in \operatorname{dom}(\sigma)$）。违反前置条件会以错误表示，并且不会产生迁移；因此，描述实际发生之迁移的效应代数仍可原封不动地应用于这些操作。若读者倾向于将失败内化，则可将下文每个 $\Sigma \rightharpoonup \Sigma$ 都理解为 $\Sigma \to \mathsf{Maybe}(\Sigma)$，并在 $\mathsf{Maybe}$ 单子中进行组合（第 2.1 节）；代价是需要将每个恒等映射替换为定义在相应操作之定义域上的偏恒等映射。基于这一上下文结构，我们定义两个核心操作：

**定义 23.** $\Sigma$ 上的 $\operatorname{get}$ 和 $\operatorname{set}$ 操作定义如下：

$$
\begin{aligned}
\operatorname{get}
&: (k : K) \to \Sigma \rightharpoonup \mathcal{V}_k, \\
\operatorname{get}
&= k \mapsto \sigma \mapsto \sigma(k), \\[4pt]
\operatorname{set}
&: (k : K) \times \mathcal{V}_k
   \to \Sigma \rightharpoonup \Sigma \times (\Sigma \rightharpoonup \Sigma), \\
\operatorname{set}
&= (k,v) \mapsto \sigma \mapsto
   \bigl(\sigma[k \mapsto v],\; \lambda \sigma'.\,\sigma' \setminus k\bigr).
\end{aligned}
\tag{21}
$$

其中，$\operatorname{get}(k)$ 的前置条件是 $k \in \operatorname{dom}(\sigma)$，$\operatorname{set}(k,v)$ 的前置条件是 $k \notin \operatorname{dom}(\sigma)$。

值得注意的是，$\operatorname{set}(k,v)$ 的类型为 $\mathcal{E}^{*}_{\Sigma}$，它恰好是余效上下文上的一个效应函数。因此，我们可以直接应用第 3.1 节的效应机制：$\operatorname{effect}_{\Sigma}$ 会自动追踪并恢复依赖注册。这正是反应式余效与可逆效应之间的协同关系：余效操作是效应，而效应是可逆的。

$\operatorname{get}$ 交给组件的是一个值，而组件能用该值做什么，则取决于对应键上的余效提供了什么。因此，一个键所携带的不只是值类型：

**定义 24.** 键 $k$ 上的一个余效是三元组 $(\mathcal{V}_k, \simeq_k, \mathcal{A}_k)$，其中，$\mathcal{V}_k$ 是定义 22 中的值类型，$\simeq_k$ 是 $\mathcal{V}_k$ 上的一个等价关系，键 $k$ 处的值按该等价关系进行比较（第 3.3.2 节），而 $\mathcal{A}_k$ 是一组余效操作，即绑定在 $k$ 处的值向持有它的组件提供的操作。每个操作 $a \in \mathcal{A}_k$ 都带有参数类型 $X_a$ 和结果类型 $B_a$，并且仅作用于该值本身：

$$
a : X_a \to \mathcal{V}_k \rightharpoonup
\mathcal{V}_k \times (\mathcal{V}_k \rightharpoonup \mathcal{V}_k) \times B_a.
\tag{22}
$$

其前两个分量组成 $\mathcal{V}_k$ 上的一个效应函数，并按定义 8 的要求带有见证；第三个分量则是结果。每个操作都必须尊重 $\simeq_k$：对于由 $\simeq_k$ 关联的两个值，该操作要么在二者上都有定义，要么在二者上都没有定义；在有定义时，它会给出由 $\simeq_k$ 关联的后继值、仍会把 $\simeq_k$ 相关值映射为 $\simeq_k$ 相关值的逆函数，以及相等的结果。一个操作通过如下提升作用于余效上下文：

$$
\begin{aligned}
a_{\Sigma}(x)(\sigma) \coloneqq {}&
\mathbf{let}\ (v,g,b) = a(x)(\sigma(k))\ \mathbf{in} \\
&\bigl(\sigma[k \mapsto v],\;
\lambda \sigma'.\,\sigma'[k \mapsto g(\sigma'(k))],\; b\bigr).
\end{aligned}
\tag{23}
$$

该式在 $k \in \operatorname{dom}(\sigma)$ 时有定义，其前两个分量构成 $\Sigma$ 上的一个效应函数。

将 $k$ 的操作定型在 $\mathcal{V}_k$ 上，正是把该操作限制在 $k$ 处绑定上的机制：提升后的操作读取并写入该绑定，同时保持其他所有键不变，因此无需额外的附加条件来表达这一点。启用隔离时，它访问的绑定就是对应隔离域解析出的绑定（定义 28）；共享同一隔离域的两个键也共享同一个绑定。如果某个操作的行为取决于另一个键，它会将那个键的值读入自己的参数 $X_a$；下一小节中的反应式规约会保证，只要读取该值的组件仍在运行，该值就保持不变（定理 63）。

#### 3.2.2. 规约与通知

上述定义描述了如何注册和访问各个依赖。然而，访问一个不存在的依赖会导致运行时失败。因此，组件不应以乐观方式访问依赖、再在其中某个依赖缺失时失败，而应当仅在其声明的全部依赖都已存在后才激活。这引出了两个问题：组件所声明的依赖是否被共同满足，以及当这一状态发生变化时系统应当如何响应。余效上下文 $\Sigma$ 带有一种自然的观察结构，使这两个问题都易于处理：对于任意余效规约 $d \subseteq K$，定义满足谓词：

$$
\sigma \vDash d \coloneqq \forall k \in d.\; k \in \operatorname{dom}(\sigma).
\tag{24}
$$

这一谓词是可判定的（因为 $\operatorname{dom}(\sigma)$ 是有限的）。由于对 $\sigma$ 的所有变更都经由效应函数进行，而这些效应函数的逆函数会恢复先前的定义域，因此在每个效应边界上都可以检测到满足状态的变化。这就是反应性的代数基础：效应系统保证每一次余效变化都会被观察到。

**定义 25.** 余效规约为：

$$
\mathcal{D}_{\Sigma} \coloneqq \mathsf{Set}(K),
\tag{25}
$$

它表示组件声明需要从环境获得的依赖集合。

这一规约之所以具有反应性，在于它对状态迁移的分类方式。任何将 $\sigma$ 变换为 $\sigma'$ 的效应，都可以由规约 $d \in \mathcal{D}_{\Sigma}$ 根据 $d$ 的满足状态是否改变来进行分类：

**定义 26.** 给定余效规约 $d \subseteq K$ 和状态 $\sigma, \sigma' \in \Sigma$，定义：

$$
\operatorname{notify}_d(\sigma,\sigma') \coloneqq
\begin{cases}
\mathtt{activating},   & \text{若 } \sigma \nvDash d \land \sigma' \vDash d, \\
\mathtt{deactivating}, & \text{若 } \sigma \vDash d \land \sigma' \nvDash d, \\
\mathtt{neutral},      & \text{其他情况。}
\end{cases}
\tag{26}
$$

由于 $\sigma \vDash d$ 是可判定的，并且所有状态迁移都由效应函数介导，因此该定义是良定义的。反应式不变量为：一个 $\mathtt{activating}$ 迁移会触发组件效应的执行（并进行完整的效应追踪），而一个 $\mathtt{deactivating}$ 迁移则会通过应用累加器来触发恢复。这些迁移的精确操作语义取决于它们与控制流之间的相互作用，并将在第 4 节中展开。

$\operatorname{set}$ 与 $\operatorname{notify}$ 共同提供了局部空间可组合性；这里的“局部”与前文含义相同，即这一保证是就单个组件自身的余效来考察的。我们采用如下判据：组件只会在满足其规约的状态下激活，因此绝不会读取不存在的绑定；上下文的每一次变化都会依据该规约进行分类，因此一旦满足状态丧失，就会在其发生之处被检测到，并驱动一次停用。上述定义直接给出了这两方面：满足性是在组件即将激活之处检查的前置条件，而 $\operatorname{notify}_d$ 则在每次迁移处都有定义。

该判据涵盖了余效顺序的一个方向，却未涵盖另一个方向。如果组件 $A$ 提供键 $k$，且组件 $B$ 声明 $k \in d_B$，那么 $B$ 只能在 $A$ 已经激活并提供 $k$ 之后激活，因为 $\sigma \vDash d_B$ 要求 $k \in \operatorname{dom}(\sigma)$。反方向却不成立：卸载 $A$ 会从 $\operatorname{dom}(\sigma)$ 中移除 $k$，从而破坏 $B$ 的满足状态；但仅凭一次通知，既无法在 $B$ 自身的拆卸过程需要读取 $k$ 的整个期间内保持其可读，也无法把 $A$ 的恢复推迟到 $B$ 完成之后。要把一次撤回安排在它所引发的各次停用之后，约束的是其他组件，而不是正在执行动作的那个组件，因此这属于该保证的全局形式；第 4.3.1 节将提供实现它所需的机制。

#### 3.2.3. 隔离与拦截

基本的余效上下文 $\Sigma$ 对一个扁平的依赖表建模。然而在实践中，系统可能需要针对不同组件，将不同的值绑定到同一个逻辑依赖。本节使用两种机制扩展余效上下文：余效隔离（同一个键在不同上下文中解析为不同的值）与余效拦截（在依赖访问上施加横切行为）。

**实现方式。** 这两种机制与 $\operatorname{get}$ 和 $\operatorname{set}$ 的区别，在于它们的作用对象。依赖提供操作会写入所有组件共同读取的共享表，因此它是该表上的效应，并带有一个用于撤回该操作的逆函数。相较之下，隔离与拦截调整的是处于某个上下文之下的组件如何解析一个键，而共享表本身保持原状。将一个操作定型为效应，会固定它的指称，即一个后继状态及与之配对的逆函数；但这并不会固定它的实现方式，后者决定该逆函数如何实际执行。

**定义 27.** 上下文上的效应函数允许采用两种实现方式：

- 原位实现会修改上下文，并返回一个非平凡的逆函数；后继状态是输入的别名，恢复过程通过运行逆函数来撤销该修改。

- 派生式实现保持输入不变，并返回一个由它派生出的新上下文，同时以恒等映射作为逆函数；恢复过程会丢弃这个派生上下文。定义 32 的递归结构所承载的，正是这种由另一个上下文派生出的上下文。

在纯函数式环境中，这两种实现方式彼此重合；命令式宿主则可以为每个操作任选其一。第 5.1.2 节同时实现了二者。隔离和拦截被直接规定为派生式实现：二者都会产生一个新上下文，其自身的表与继承而来的表有所不同；因此，下文将二者定型为从上下文到上下文的映射，而不是效应函数。共享表没有发生任何变化，所以既没有需要追踪的逆函数，也没有任何内容需要定义 12 来提升；恢复时，只需将派生上下文连同它所携带的调整一起丢弃。对派生表的赋值会覆盖继承表在该键处原有的任何内容，因此这两个操作都不带前置条件。

**余效隔离。** 余效隔离通过引入隔离域，使同一个依赖可以在不同上下文中绑定到不同的值。这一机制广泛适用于多租户系统、测试环境和组件沙箱。

**定义 28.** 带隔离的余效上下文定义为：

$$
\Sigma_{\mathrm{iso}} \coloneqq
(K \rightharpoonup R) \times ((r : R) \rightharpoonup \mathcal{V}_r).
\tag{27}
$$

它可以表示为一对 $(\rho,\sigma)$，其中：

- $\rho : K \rightharpoonup R$ 是隔离域表，为每个被隔离的键指派一个隔离域标识符；不在 $\operatorname{dom}(\rho)$ 中的键会解析到以它自身为标识的隔离域，因此在这种情况下记 $\rho(k)=k$（$R \supseteq K$）；

- $\sigma : (r : R) \rightharpoonup \mathcal{V}_r$ 是依赖表，即从隔离域标识符到具有相应类型之值的依赖偏函数。

这种双层映射结构将逻辑层与存储层解耦，使依赖访问能够感知上下文。访问键 $k$ 时，系统首先解析 $\rho(k)$ 以获得隔离域标识符 $r$，然后访问 $\sigma(r)$ 以取得实际值。

**定义 29.** $\Sigma_{\mathrm{iso}}$ 上的 $\operatorname{get}$、$\operatorname{set}$ 和 $\operatorname{isolate}$ 操作如下：

$$
\begin{aligned}
\operatorname{get}
&: (k : K) \to \Sigma_{\mathrm{iso}} \rightharpoonup \mathcal{V}_{\rho(k)}, \\
\operatorname{get}
&= k \mapsto (\rho,\sigma) \mapsto \sigma(\rho(k)), \\[4pt]
\operatorname{set}
&: (k : K) \times \mathcal{V}_{\rho(k)}
   \to \Sigma_{\mathrm{iso}} \rightharpoonup
   \Sigma_{\mathrm{iso}} \times
   (\Sigma_{\mathrm{iso}} \rightharpoonup \Sigma_{\mathrm{iso}}), \\
\operatorname{set}
&= (k,v) \mapsto (\rho,\sigma) \mapsto
   \Bigl((\rho,\sigma[\rho(k) \mapsto v]),\;
   \lambda(\rho',\sigma').(\rho',\sigma' \setminus \rho'(k))\Bigr), \\[4pt]
\operatorname{isolate}
&: K \times R \to \Sigma_{\mathrm{iso}} \to \Sigma_{\mathrm{iso}}, \\
\operatorname{isolate}
&= (k,r) \mapsto (\rho,\sigma) \mapsto (\rho[k \mapsto r],\sigma).
\end{aligned}
\tag{28}
$$

其中，$\operatorname{get}$ 和 $\operatorname{set}$ 带有将定义 23 的前置条件沿 $\rho$ 迁移后得到的条件，分别为 $\rho(k) \in \operatorname{dom}(\sigma)$ 和 $\rho(k) \notin \operatorname{dom}(\sigma)$。$\operatorname{isolate}(k,r)$ 所派生的上下文将隔离域 $r$ 指派给 $k$，并原样继承依赖表；因此，如果一个键已经被隔离，它会被重新指派，而不是被拒绝。

余效隔离机制实质上实现了一套运行时特设多态系统。通过隔离域标识符，同一个依赖键可以在不同上下文中解析为完全不同的值，而且这种多态性可以在运行时动态调整。与传统依赖注入相比，余效隔离提供了粒度更细的控制，能够针对特定组件进行定制化隔离；$\operatorname{set}$ 仍然是效应函数（$\mathcal{E}^{*}_{\Sigma_{\mathrm{iso}}}$），因而继承了可逆性，而 $\operatorname{isolate}$ 无需逆函数，因为它派生出一个上下文，而不是写入共享表。

**余效拦截。** 第二种机制是余效拦截，它将横切元数据附加到依赖访问之上，从而在不修改依赖值的情况下添加行为。这些元数据既可以由上下文携带，也可以由组件声明，因此我们同时扩展余效上下文和余效规约：

**定义 30.** 带拦截的余效上下文与规约定义为：

$$
\begin{aligned}
\Sigma_{\mathrm{inter}}
&\coloneqq ((k : K) \to \mathcal{M}_k)
\times ((k : K) \rightharpoonup (\mathcal{M}_k \to \mathcal{V}_k)), \\
\mathfrak{D}_{\mathrm{inter}}
&\coloneqq (k : K) \rightharpoonup \mathcal{M}_k.
\end{aligned}
\tag{29}
$$

上下文 $\Sigma_{\mathrm{inter}}$ 是一个二元组 $(\iota, \sigma)$：$\iota$ 是安装在上下文本身、由上下文携带的元数据，默认值为空元数据 $\epsilon_k$；$\sigma$ 将每个键 $k$ 映射到一个提供者函数，该函数从元数据 $\mathcal{M}_k$ 映射到值 $\mathcal{V}_k$。规约 $d \in \mathfrak{D}_{\mathrm{inter}}$ 携带组件声明的元数据，为每个键指定其元数据 $d(k)$，其中 $\operatorname{dom}(d)$ 作为依赖集。每个键都为其元数据配备一个幺半群 $(\mathcal{M}_k, \oplus_k, \epsilon_k)$：合并运算 $\oplus_k$ 满足结合律，单位元 $\epsilon_k$ 表示空元数据。

**定义 31.** $\Sigma_{\mathrm{inter}}$ 上的 `get`、`set` 和 `intercept` 操作如下：

$$
\begin{aligned}
\operatorname{get}&:
((k : K) \times \mathcal{M}_k)
\to \Sigma_{\mathrm{inter}}
\rightharpoonup \mathcal{V}_k, \\
\operatorname{get}
&= (k, \mu) \mapsto (\iota, \sigma) \mapsto
\sigma(k)(\mu \oplus_k \iota(k)), \\[4pt]
\operatorname{set}&:
((k : K) \times (\mathcal{M}_k \to \mathcal{V}_k))
\to \Sigma_{\mathrm{inter}}
\rightharpoonup
\bigl(\Sigma_{\mathrm{inter}} \times
(\Sigma_{\mathrm{inter}} \rightharpoonup \Sigma_{\mathrm{inter}})\bigr), \\
\operatorname{set}
&= (k, \psi) \mapsto (\iota, \sigma) \mapsto
\left(
(\iota, \sigma[k \mapsto \psi]),
\lambda(\iota', \sigma').(\iota', \sigma' \setminus k)
\right), \\[4pt]
\operatorname{intercept}&:
((k : K) \times \mathcal{M}_k)
\to \Sigma_{\mathrm{inter}}
\to \Sigma_{\mathrm{inter}}, \\
\operatorname{intercept}
&= (k, \nu) \mapsto (\iota, \sigma) \mapsto
(\iota[k \mapsto \iota(k) \oplus_k \nu], \sigma).
\end{aligned}
\tag{30}
$$

其中，`get` 和 `set` 对提供者表分别具有定义 23 中的前置条件，即 $k \in \operatorname{dom}(\sigma)$ 和 $k \notin \operatorname{dom}(\sigma)$。$\operatorname{intercept}(k, \nu)$ 所派生的上下文，会把 $\nu$ 合并到键 $k$ 处继承而来的元数据上，同时原样继承提供者表。

当规约为 $d$ 的组件访问键 $k$ 时，系统求值 $\sigma(k)(d(k) \oplus_k \iota(k))$：组件声明的元数据会与上下文携带的元数据 $\iota$ 合并，然后将提供者函数应用于合并结果。此合并遵循各个键自身的语义（例如，标量字段采用覆盖方式，集合值字段采用并集方式），并且具有右偏性，因此 $\iota(k)$ 拥有更高优先级，可以覆盖组件的声明。这样，外围上下文便能在不修改组件的情况下，约束组件使用余效的方式（例如第 6.3 节）。

### 3.3. 上下文范式

第 3.1 节和第 3.2 节都作用于上下文：前者将上下文作为效应的载体，后者将其作为余效的载体，但二者并未说明同时承载效应与余效的单一上下文应当是什么样子。本节为这种统一给出一个具体构造，从余效中组装出一种观察等价关系，以补足第 3.1.3 节悬而未决的效应独立性，并论证由此得到的上下文类型本身构成一种编程范式。

#### 3.3.1. 统一上下文

对于上下文 $\Gamma$，效应上下文 $\partial\Gamma$（第 3.1 节）提供了一层更高阶的抽象，其中携带前一层上下文及该层的累加器（定义 2）。将这一结构递归化，并与余效上下文 $\Sigma$ 结合，即得到如下类型：

**定义 32.** 上下文类型 $\Gamma_\infty$ 定义为：

$$
\Gamma_\infty
\coloneqq
\mu \Gamma.\; \Gamma \times (\Gamma \to \Gamma) \times \Sigma,
\tag{31}
$$

其中三个投影分别为：

- $\Gamma$：当前上下文状态（递归）；

- $\Gamma \to \Gamma$：用于恢复本层效应的累加器；

- $\Sigma$：携带依赖信息的余效上下文。

在此定义下，`effect` 将 $\mathfrak{E}_{\Gamma_\infty}$ 映射到自身，从而把整个 $\partial$ 塔统一为一个自相似类型。余效上下文 $\Sigma$ 在结构上整合进该类型：依赖操作（`set`、`get`）作用于 $\Sigma$，而累加器则追踪这些操作的逆转。由于 $\Sigma$ 所基于的类型族 $\mathcal{V}$ 不受约束，系统需要在组件之间共享的任何状态，都可以编码为一个具有适当值类型的依赖——$\Sigma$ 因而涵盖所有共享可变状态，而不仅是组件间依赖。组件与其环境之间的每一次交互，都通过这一个实体进行。

**层次化组合。** $\Gamma_\infty$ 的递归结构支持层次化控制：父上下文聚合多个子层级的效应，形成树状控制结构；这种结构既保持模块化，又支持统一的跨层级管理。效应变换将“插入”这一隐喻按字面意义实现出来：

- 加载组件对应于执行其效应（插入）；

- 卸载组件对应于恢复其效应（拔出，且不影响其他正在运行的组件）；

- 层次结构中不同层级的组件可以彼此独立地加载和卸载；父上下文聚合并管理其所有子组件的效应，从而支持任意深度的嵌套组合。

#### 3.3.2. 观察等价

第 3.1 节的恢复保证断言状态之间相等（定理 7），但这是一种理想化，因为物理状态不可能恢复到原来所处的确切形态。例如，`free` 会把内存块释放给分配器，却不会恢复堆在执行 `malloc` 之前的布局；生成式名称也不会由丢弃该名称的逆操作恢复，因为下一次创建会取得一个全新的名称 [39]。因此，第 3 节中的等式都应在某种等价关系 $\simeq$ 下理解；这里我们取 $\simeq$ 为观察等价：当任何观察者都无法区分两个状态时，二者即由该关系关联。通过比较行为而非表示来建立程序等价，是一种已经确立的方法 [40]；这种比较所产生的关系取决于观察者能够使用什么 [41]。上下文的观察者能够使用的是该上下文所携带的余效，而每个余效都附带自身的等价关系（定义 24），因此上下文上的关系由这些关系组装而成。本小节的任务就是完成这种组装；对该关系取商，便可获得第 3.1.3 节所要求的独立性。

**定义 33.** 若两个余效上下文将同一组键绑定到彼此相关的值，则二者相关；若一个上下文的两个状态的余效投影相关，则这两个状态相关：

$$
\begin{aligned}
\sigma \simeq \sigma'
&\coloneqq
\operatorname{dom}(\sigma) = \operatorname{dom}(\sigma')
\;\land\;
\forall k \in \operatorname{dom}(\sigma).\;
\sigma(k) \simeq_k \sigma'(k), \\
\gamma \simeq \gamma'
&\coloneqq
\sigma_\gamma \simeq \sigma_{\gamma'}.
\end{aligned}
\tag{32}
$$

这里以 $\sigma_\gamma$ 表示 $\gamma$ 的余效投影（定义 32）。

由此，状态中未被任何键绑定的部分会被遗忘；正是这种遗忘，才使定理 7 能够在 $\simeq$ 的意义下得到解读：除非有某个键绑定了上例中的堆布局和生成式名称，否则它们都位于该关系之外。第 3.2.2 节对 $\simeq$ 的要求由此推导而来，而无须作为假设给出。相关状态具有相同的定义域，因此它们在定义 26 的满足谓词 $\sigma \vDash d$ 和分类 $\operatorname{notify}_d$ 上结论一致，而反应性则是 $\Sigma/{\simeq}$ 的一个性质。

将该关系称为观察等价，实际上是对每个 $\simeq_k$ 作出如下断言：它所区分的内容，不会多于键 $k$ 的操作所能分辨的内容。值的观察者会运行这些操作，并读取其结果。

**定义 34.** 设 $V$ 携带定义 24 所指的一组操作 $\mathcal{A}$；对于每个操作 $a \in \mathcal{A}$，以 $\mathfrak{M}(a)$ 表示对所有参数 $x : X_a$ 的效应函数 $a(x)$ 所生成的变换幺半群（定义 17）。$\mathcal{A}$ 上的一个测试，是由各幺半群 $\mathfrak{M}(a)$（$a \in \mathcal{A}$）的生成元组成的有限字；每个字母都作用于其前序字母所留下的值。测试的结果，是沿途那些属于操作正向映射的字母所产生的结果；只要某项前置条件失败，该测试便无定义。若 $\mathcal{A}$ 上的每个测试要么在 $v$ 与 $v'$ 上都有定义，要么在二者上都无定义，并且在二者上产生相同结果，则称值 $v, v' : V$ 不可区分，记作 $v \approx_{\mathcal{A}} v'$。

**引理 35.** 不可区分性是操作所尊重的最粗关系。也就是说：

1. $\mathcal{A}$ 的每个操作都在定义 24 的意义下尊重 $\approx_{\mathcal{A}}$；

2. 凡是被每个操作都尊重的等价关系，都包含于 $\approx_{\mathcal{A}}$。

因此，$\simeq_k$ 的每一种可容许选择都包含于 $\approx_{\mathcal{A}_k}$，而 $\approx_{\mathcal{A}_k}$ 本身也是可容许的。

**证明。**

1. 设 $v \approx_{\mathcal{A}} v'$，并将 $a \in \mathcal{A}$ 应用于某个参数。在测试前添加一个字母后，所得仍是测试，因此正向映射到达的值仍然不可区分；任何一个由操作产生的逆映射从不可区分的参数出发所到达的值也同样不可区分。单字母测试保证该操作在两者上要么都有定义、要么都无定义，并保证其结果相等。

2. 设 $R$ 为这样的等价关系，且 $v R v'$。测试中的每个字母，都是某项操作的正向映射或该操作产生的逆映射；尊重性使 $R$ 沿这两类映射均得以保持，从而在每个字母处，所到达的值始终相关，所得结果始终相等。因此，每个测试在 $v$ 和 $v'$ 上的表现均一致。

$\square$

仅仅在所有地方都以 $\simeq$ 替换 $=$ 还不够，因为效应函数除了返回状态之外，还会返回一个逆函数；由 $\simeq$ 视为相同的两个状态，还必须产生同样会被 $\simeq$ 视为相同的逆函数。

**定义 36.** 若映射 $f : \Gamma \to \Gamma$ 满足

$$
\forall \gamma, \gamma' \in \Gamma.\;
\gamma \simeq \gamma'
\;\Longrightarrow\;
f(\gamma) \simeq f(\gamma'),
\tag{33}
$$

则称 $f$ 尊重 $\simeq$。若两个映射在每个状态上的结果都相关，则称二者相关；若 $\partial\Gamma$ 中两个二元组的两个分量分别相关，则称这两个二元组相关：

$$
\begin{aligned}
f \simeq g
&\coloneqq
\forall \gamma \in \Gamma.\; f(\gamma) \simeq g(\gamma), \\
(\delta, g) \simeq (\delta', g')
&\coloneqq
\delta \simeq \delta' \;\land\; g \simeq g'.
\end{aligned}
\tag{34}
$$

尊重 $\simeq$ 的映射可以下降为 $\Gamma/{\simeq}$ 上的映射，而由 $\simeq$ 关联的两个映射会下降为该商集上的同一个映射。一个效应函数同时需要这两个性质：前者保证它计算出的状态在商集上是确定的，后者保证它返回的逆函数也具有这一性质。

**定义 37.** 在 $\simeq$ 的意义下解读定义 8：当 $e$ 作为映射 $\Gamma \to \partial\Gamma$ 尊重 $\simeq$，并且令 $(\delta, g) = e(\gamma)$ 后，对每个 $\gamma \in \Gamma$ 都有：

1. $g(\delta) \simeq \gamma$；

2. $g$ 尊重 $\simeq$；

则 $e \in \mathfrak{E}_\Gamma$ 属于 $\mathfrak{E}^*_\Gamma$。

若取 $\simeq$ 为 $\Gamma$ 上的相等关系，便恢复定义 8。

**引理 38.** 按定义 37 解读 $\mathfrak{E}^*_\Gamma$ 时，第 3.1 节断言的每个状态等式，在以 $\simeq$ 替换 $=$ 后都成立；而且，从 $(\gamma_0, \operatorname{id}_\Gamma)$ 可达的每个状态，其累加器都尊重 $\simeq$。

**证明。** 累加器是若干逆函数的复合；根据定义 37(2)，每个逆函数都尊重 $\simeq$，而尊重 $\simeq$ 的映射之复合仍然尊重 $\simeq$，其基本情形为 $\operatorname{id}_\Gamma$。于是，第 3.1 节中的证明可以原样成立，因为正是尊重性使关系得以通过逆函数传递：由 $g_2(\delta_2) \simeq \delta_1$ 和 $g_1(\delta_1) \simeq \gamma$，可借助尊重性得到 $(g_1 \circ g_2)(\delta_2) \simeq \gamma$；每一次逆函数复合都采用这一步，而定理 7 的健全性不变量也由这一步改写为 $\varphi(\gamma) \simeq \gamma_0$。

$\square$

定义 19 所要求的交换性，也由同一引理在 $\simeq$ 的意义下解读；只有这样解读，交换性才真正有可能实现：两个操作即使留下由 $\simeq_k$ 视为相同的值，仍然可以算作可交换。与这些操作的提升所诱导的效应函数相比，这里还对两个操作多提出了一项要求，因为操作还会产生结果。

**定义 39.** 若操作 $a$ 与 $a'$ 的提升，在每一对参数上都作为效应函数彼此独立（定义 19），并且任一操作的变换都不会扰动另一操作产生的结果，则称 $a$ 与 $a'$ 独立：

$$
\forall x : X_a,\;
g \in \mathfrak{M}(a'_\Sigma),\;
\sigma \in \Sigma.\;
\operatorname{pr}_3\bigl(a_\Sigma(x)(g(\sigma))\bigr)
=
\operatorname{pr}_3\bigl(a_\Sigma(x)(\sigma)\bigr),
\tag{35}
$$

并且在交换 $a$ 与 $a'$ 后也满足同一条件。这里以 $\mathfrak{M}(a_\Sigma)$ 表示提升 $a_\Sigma(x)$ 在所有参数上的变换幺半群，正如定义 34 以 $\mathfrak{M}(a)$ 表示操作自身的变换幺半群一样。若 $\mathcal{A}_k$ 中任意两个操作均相互独立，则称键 $k$ 是可交换的；这里也要求一个操作与其自身独立。

对于不同的键，该条件直接成立。

**定理 40.** 位于不同键上的操作彼此独立。

**证明。** 设 $a \in \mathcal{A}_k$，$a' \in \mathcal{A}_{k'}$，且 $k \neq k'$。根据定义 24，$\mathfrak{M}(a_\Sigma)$ 的每个生成元都具有 $\sigma \mapsto \sigma[k \mapsto u(\sigma(k))]$ 的形式，其中 $u$ 是 $\mathcal{V}_k$ 上的映射；该生成元要么是正向映射的提升，要么是某个产生的逆映射之提升。$k'$ 处的 $a'$ 同理。任意两个这样的映射都可交换，因为每个映射只读写一个键，且两个键彼此不同；引理 18(1) 将生成元之间的交换性扩展到两个幺半群。对于第二项条件，$a_\Sigma$ 在 $\sigma$ 处产生的内容——无论逆函数还是结果——都由 $\sigma(k)$ 决定，而 $\mathfrak{M}(a'_\Sigma)$ 的每个生成元都会保持 $\sigma(k)$ 不变。$\square$

若一个键的值是一张表，且表项可以彼此独立地添加和删除，那么该键就是可交换的；注册路由或事件监听器便是典型情形：两次注册无论以何种顺序进行，最终得到的表都会以相同方式回答每个测试；而且，任一注册都能在另一注册仍然存在时单独撤回。若一个键的值是一条有序链，那么它就不是可交换的，因为插在另一中间件之前的中间件会看到不同的请求，并且无论采用哪种顺序，都无法在不干扰另一项的情况下撤回其中一项。开篇示例中的分配器，则依据其接口所公开的内容而分属两种情况。若该键的任何操作都不会比较其发放的句柄，$\simeq_k$ 就可以在句柄重命名的意义下关联两个堆；CompCert 正是以这种方式关联程序及其翻译的内存状态 [42]，此时分配是可交换的。若地址既作为操作结果返回，又按相等性进行比较，那么任何可容许的 $\simeq_k$ 都无法使两种分配顺序一致，此时该键便不可交换。

组件所执行的是一个操作序列，其中每个操作都可能依赖先前操作产生的结果；以下定理讨论的，正是这种形态的效应函数。

**定义 41.** 余效中介的效应函数构成最小集合 $\mathfrak{E}^{\mathcal{A}}_\Sigma \subseteq \mathfrak{E}_\Sigma$；该集合包含单位元 $\eta_\Sigma$，并且在下述构造下封闭：对于键 $k$、操作 $a \in \mathcal{A}_k$、参数 $x : X_a$，以及成员族 $(e_b)_{b \in B_a}$，

$$
\begin{aligned}
\sigma \mapsto {}&
\mathbf{let}\ (\delta, s, b) = a_\Sigma(x)(\sigma)\ \mathbf{in} \\
&\mathbf{let}\ (\varepsilon, t) = e_b(\delta)\ \mathbf{in} \\
&(\varepsilon, s \circ t)
\end{aligned}
\tag{36}
$$

仍然是该集合的成员。每个阶段执行一个操作，并依据该操作的结果选择后续步骤，因此，一个参数可以依赖已经获得的结果。某个成员中出现的操作，是该成员的各个阶段在每一种结果选择下所执行的操作。

**定理 42.** 设 $e_1, e_2 \in \mathfrak{E}^{\mathcal{A}}_\Sigma$，并且凡是 $e_1$ 和 $e_2$ 中都出现操作的键，均为可交换键（定义 39）。则 $e_1$ 与 $e_2$ 相互独立（定义 19）。

**证明。** 对定义 41 的构造作归纳可知，$\mathfrak{M}(e_i)$ 包含于由 $e_i$ 中所出现操作的生成元生成的子幺半群：单位元生成平凡幺半群；一个阶段是 $a_\Sigma(x)$ 与某个成员的 $\diamond$-复合，因此可以应用引理 18(2)。

对于定义 19 的第 (1) 项，根据引理 18(1)，只需证明 $e_1$ 中某个操作的生成元与 $e_2$ 中某个操作的生成元可交换。当这两个操作位于不同键上时，结论由定理 40 给出；当它们位于同一个键上时，该键同时承载二者的操作，并由假设可知该键可交换。

对于第 (2) 项，取 $g \in \mathfrak{M}(e_2)$；它是 $e_2$ 中所出现操作的若干生成元之复合。下面对 $e_1$ 的构造作归纳。单位元在每个状态处都产生 $\operatorname{id}_\Sigma$。在一个阶段，令

$$
(\delta, s, b) = a_\Sigma(x)(\sigma),
\qquad
(\varepsilon, t) = e_b(\delta),
$$

于是该阶段在 $\sigma$ 处产生 $s \circ t$。将操作的独立性逐一应用于 $g$ 的每个生成元，可知在 $g(\sigma)$ 处仍会得到 $s$ 和 $b$，因此仍会选择同一个后续计算 $e_b$；而第 (1) 项使其开始运行的状态位于 $g(\delta)$，归纳假设又保证在那里仍会得到 $t$。因此，该阶段在 $g(\sigma)$ 处仍然产生 $s \circ t$。

$\square$

组件与其环境之间的每次交互都通过上下文进行，而类型族 $\mathcal{V}$ 不受约束，因此系统可以把组件间共享的每个位置都绑定到各自的键上（第 3.3.1 节）。于是，组件的效应函数就是某个余效中介效应函数沿余效投影的提升，而独立性会传递到这一提升；该提升的变换只会改变投影。由此，第 3.1.3 节悬而未决的假设得以满足，整个组件系统也随之获得时间可组合性。

这种分解所划分的，是计算中的可交换部分与顺序敏感部分。可交换部分由效应承载：组件按照自身任务所需的任意顺序执行这些效应，而推论 21 允许系统按照自己认为方便的任意顺序撤销它们，任意两个组件都不会彼此制约。顺序敏感部分则由余效承载，因为如果一个键的操作不可交换，其顺序就必须从效应外部施加，而有两个位置可以施加这种顺序。在单个组件内部，累加器施加顺序，以 LIFO 顺序撤销效应所做的一切（定理 16）。在组件之间，声明的余效施加顺序：一个组件提供另一个组件所声明的内容，并且“提供”先于“声明得到满足”发生（第 3.2.2 节）。由此，可组合性是在组件而非单个效应的粒度上获得的，而这正是第 4 节所采用的尺度。

该定理有两个值得明确指出的限制。其一，将每个共享位置绑定到一个键，是该范式要求遵循的纪律，而非构造本身固有的性质；因此，系统无法具体化为余效的位置，既位于第 6.1 节所述的系统边界之外，也随之位于该定理的适用范围之外。其二，一个键是否可交换，是该键所公开接口的性质；因此，满足可交换性是提供该键的组件所承担的义务，而不是消费该键的组件所承担的义务。

#### 3.3.3. 上下文范式的定位

各种编程范式的根本差异，在于它们处理副作用的方式。两个既有的极点界定了这一光谱：

**显式状态传递（函数式）。** 为了保持引用透明性，纯函数式语言将副作用建模为对状态的显式变换。State 单子 $S \to (A, S)$ [23] 让一个环境贯穿每次计算。这种方法提供了很强的组合性保证：效应在类型中可见，并且可以进行等式推理。然而，它也带来了显著的人体工程学代价：调用链中的每个函数都必须接收并返回状态参数，即使它只是原封不动地将该状态向后传递。随着效应维度（日志、配置、I/O 等）增加，单子栈或效应处理器的样板代码会迅速增多。

**隐式修改（命令式／面向对象）。** 主流命令式语言允许组件修改共享状态并访问依赖，而无须在调用点显式声明。在效应一侧，一个代表性示例是 React 的 `useEffect` Hook：它会在组件的内部纤程（fiber）上注册一个持久效应，但效应目标和注册机制都不会作为显式参数出现——其标识依赖于隐藏运行时状态中的调用顺序位置。在余效一侧，Java 的服务定位器模式（例如 Spring 的 `ApplicationContext.getBean(...)`）会在运行时从进程级注册表中取得依赖，因此每个调用点都需要进行空值检查和类型转换；依赖关系是隐式的，并散布于整个代码库。更一般地说，要理解 `f()` 如何修改系统或依赖系统，就必须传递式地阅读其实现。重构也会变得脆弱，因为移动或删除一次调用，可能会悄无声息地破坏远处的不变式。

上下文范式将函数式方法的可追踪性与命令式方法的人体工程学优势结合起来。效应和余效都通过一个显式上下文参数来中介。因此，每个操作都可归属于调用它的特定上下文，并进而归属于该上下文所属的组件。

上下文范式不仅结合了两个极点各自的优势，还允许开发者逐一处理每项效应和依赖，并自动将它们组合成系统行为。对于可逆效应，开发者只需提供每个原子操作的逆操作，任何复合操作的逆操作都会通过组合自动得到（第 3.1 节），因此组件的拆卸过程由其加载过程推导而来，无须另外手写一套拆卸逻辑。对于反应式余效，组件只需声明自身需要的依赖，运行时便会自动解析并重新连接这些依赖（第 3.2 节）；随着提供者被添加、移除或替换，这些依赖始终能保持一致连接。在这两个方向上，原本需要依赖开发者纪律来保证的正确性，都转化为该范式的一项结构性性质。

## 4. 动态组合演算

第 3 节仅以局部形式建立了空间可组合性与时间可组合性。要把二者推广到整个系统，就需要将系统分解为若干组件；每个组件都把一份余效规约与一个带见证的效应函数配对，从而使与共享环境的每一次交互都可归属于其中某个组件。以下各节为这种分解赋予操作语义，并以全局形式建立空间可组合性与时间可组合性。

第 4.1 节和第 4.2 节给出能够用规则刻画生命周期的最小演算，其中假定每次迁移都是原子的、即时的且不会失败；第 4.3 节放宽这三项假设——其中原子性会按迁移可能运行的两个方向各放宽一次——纳入运行时可在一次迁移开始与结束之间插入的各种控制流形式，最终得到真实运行时所实现的演算；第 4.4 节则建立该演算的元理论，即保持性、全局时间可组合性与空间可组合性、进展性以及合流性。

### 4.1. 组件与纤程

本节确定规则所作用的对象：组件；纤程（fiber），即组件的一个实例化，它携带自己的生命周期状态；以及注册表，它保存一个状态所携带的纤程，并由此读出余效上下文。

**组件。** 一个组件由一个三元组给出，其余效侧被拆分为它从环境中读取的内容，以及它向环境提供的内容。

**定义 43.** 在同时承载效应与余效的上下文 $\Gamma$（定义 32）上，组件定义为：

$$
\mathfrak{C}_{\Gamma}
\coloneqq
\mathfrak{D}_{\Gamma} \times \mathfrak{P}_{\Gamma} \times \mathfrak{E}^{*}_{\Gamma}
\tag{37}
$$

它表示一个三元组 $(d,p,e)$，其中：

- $d : \mathfrak{D}_{\Gamma}$ 是定义 25 的余效规约，声明需要从环境中获得的依赖；

- $p : \mathfrak{P}_{\Gamma} \coloneqq \mathsf{Set}(K)$ 是供给，声明组件可能提供的余效键；其效应函数不会写入 $p$ 之外的任何键；

- $e : \mathfrak{E}^{*}_{\Gamma}$ 是定义 8 的带见证效应函数，定义组件处于活跃状态时所贡献的效应，以及用于撤回这些效应的逆函数。

这两项声明构成同一个接口的两个方向：$d$ 表示组件从环境中读取什么，$p$ 表示组件向环境中写入什么；第 4.2 节不允许同一注册表中的任意两个纤程具有相交的供给集。全文的下标都取在 $\Gamma$ 上；由于余效上下文是 $\Gamma$ 的一个投影（定义 32），定义 25 中的 $\mathfrak{D}_{\Sigma}$ 在这里记作 $\mathfrak{D}_{\Gamma}$。

本章与第 3.2.3 节的区别正在于要求供给集彼此不相交。定义 28 的隔离机制允许一个键经由隔离域表进行解析，因而两个纤程可以在不同隔离域中提供同一个键；若演算带有隔离域，就可以把“不相交”放宽为“在同一隔离域内不相交”，并根据声明某个键的纤程所处的隔离域来解析该键。这里不引入隔离域，而是让每个键都在一个共享隔离域中读取；正因如此，上述不相交条件才是正确的条件，并且每个键的提供者才是唯一的（定义 45）。这一条件限制的是组件能够被实例化的次数：供给集非空的组件同一时间只能有一个纤程；因此，下文出现的多个实例，来自不提供任何内容的组件——这也是仅消费依赖或注册其他组件的组件所处的常见情形。

运行系统中的组件实例会随时间而激活和停用，因此它携带一个生命周期状态；迁移则负责把它从一个生命周期状态推进到另一个生命周期状态：激活会执行 $e$，在上下文上累积副作用；停用则应用累加器以恢复上下文。最简单的生命周期是图 1 所示的双状态模型，第 4.2 节会为其给出规则；第 4.3 节则会随着各种控制流特性的引入而逐步细化该模型。

![图 1：基础组件生命周期](/images/spatiotemporal-composability/figure-1-lifecycle.png)

<p class="figure-caption">图 1｜基础组件生命周期</p>

**纤程。** 同一个组件可以被多次实例化，每个实例都携带自己的生命周期状态。我们把这样的实例称为纤程。一个纤程记录产生它的组件、它是在何纤程之下被实例化的、它所提供的余效，以及它目前处于生命周期中的哪个位置。

**定义 44.** 固定一个纤程名称集合 $\mathfrak{N}$。实例化组件 $(d,p,e) \in \mathfrak{C}_{\Gamma}$ 的纤程是一个元组 $\langle d,p,e,\pi,\sigma,\tau,\theta \rangle$，其中：

- $d : \mathfrak{D}_{\Gamma}$、$p : \mathfrak{P}_{\Gamma}$ 和 $e : \mathfrak{E}^{*}_{\Gamma}$ 分别是定义 43 的余效规约、供给和效应函数；

- $\pi : \mathfrak{N} \cup \{\mathsf{root}\}$ 是父级，即当前纤程是在其下被实例化的那个纤程，或者根标记 $\mathsf{root}$；

- $\sigma : \Sigma$ 是该纤程自身的余效表（定义 22）；在纤程开始激活之前它为空，并在纤程的效应运行时由这些效应写入；

- $\tau : \{\bot,\top\}$ 是退役标志；新建纤程中的值为 $\bot$，而编排器一旦将该纤程退役，其值便为 $\top$；

- $\theta : \Theta_{\Gamma}$ 是生命周期状态；在第 4.2 节的双状态模型中，它为

$$
\Theta_{\Gamma}
\coloneqq
\mathsf{Inactive}
\mid
\mathsf{Active}(g,\omega),
\tag{38}
$$

其中，$g : \Gamma \to \Gamma$ 是累加器，$\omega : d \to \mathfrak{N}$ 是已提交视图。

已提交视图 $\omega$ 将纤程声明的每个键映射到迁移提交时提供该键的纤程名称。第 4.3 节会把 $\Theta_{\Gamma}$ 替换为进行中的迁移所需要的扩展；定义 44 的其余部分只需为这两种模型统一给出一次，区别仅在于：第 4.3 节的每一层扩展都会使 $e$ 按一种更丰富的效应类型来解读。

**注册表。** 一个状态按名称保存其纤程；纤程的身份，以及第 3.2 节的余效上下文，都从这种安排中读出。

**定义 45.** 以 $\mathfrak{F}_{\Gamma}$ 表示 $\Gamma$ 上的纤程集合。状态 $\gamma \in \Gamma$ 携带一个注册表

$$
F_{\gamma} : \mathfrak{N} \rightharpoonup \mathfrak{F}_{\Gamma},
\tag{39}
$$

它是一个有限偏函数，其父指针构成一棵以 $\mathsf{root}$ 为根的树；此外，状态还包含 $\Gamma$ 中未被任何纤程的 $\sigma$ 命名的其他内容。我们用 $\gamma(n)$ 表示 $F_{\gamma}(n)$；当状态明确时，将 $\gamma(n)$ 的字段简写为带下标 $n$ 的形式，因此 $d_n,p_n,e_n,\pi_n,\sigma_n,\tau_n,\theta_n$ 是定义 44 中的各字段，$g_n,\omega_n$ 则是 $\theta_n$ 携带的累加器与已提交视图。$\gamma[\theta_n \mapsto \theta']$、$\gamma[n \mapsto \langle \cdots \rangle]$ 和 $\gamma \setminus n$ 分别表示与 $\gamma$ 仅在一个字段、一个纤程以及某个纤程是否存在这一点上有所不同的状态。

纤程名称赋予纤程一个能够在自身发生变化后继续保持的身份：以下每条规则都只重写一个纤程的生命周期状态，而让其他纤程保持不变，因此规则必须指出它所作用的是哪个纤程；此外，还有两个字段引用纤程而非描述纤程，即父级 $\pi$ 和已提交视图 $\omega$。名称是原子：没有任何规则会计算名称、检查名称的内部结构，或以相等性之外的任何方式关联两个名称；引入一个纤程时，只需抽取一个尚未使用的名称。这正是动态创建局部名称的规则体系 [39]，这里将其用于纤程身份。

每个纤程各自拥有一张表，这意味着余效上下文并非被存储起来，而是派生而来：它就是所有活跃纤程共同提供的内容。

$$
\sigma_{\gamma}
\coloneqq
\bigcup\left\{\,\sigma_m \mid
m \in \operatorname{dom}(F_{\gamma}),
\ \theta_m = \mathsf{Active}(-,-)\,\right\}.
\tag{40}
$$

这个并集是良定义的，因为一个纤程只会写入其声明的键，即 $\operatorname{dom}(\sigma_n) \subseteq p_n$；而不同纤程的供给集彼此不相交（定义 43），所以每个 $k \in \operatorname{dom}(\sigma_{\gamma})$ 都恰好位于一个 $\mathsf{Active}$ 纤程的表中。我们把该纤程的名称记作 $\operatorname{provider}_k(\gamma) \in \mathfrak{N}$，并称其为 $k$ 的提供者。因此，每个键都只有一个可能的提供者；这个提供者由供给集决定，而不是由状态决定。没有任何规则会直接写入 $\sigma_n$：一个纤程所作的供给，就是它自身的效应函数所执行的那些 `set` 操作；这些操作落入 $\sigma_n$，因而已经是 $e_n$ 所返回状态的一部分，之后又随累加器的应用而离开。只有效应中的余效部分才以这种方式记录，因为只有余效部分是其他纤程能够在规约中声明的内容；修改 $\gamma$ 中其他位置之状态的效应，与其他效应一样由 $g$ 追踪，但没有纤程能够在规约中命名它们，因此它们不会形成任何顺序约束。

于是，第 3.2.2 节的满足关系可以原封不动地应用，并以 $\gamma \vDash d$ 简写 $\sigma_{\gamma} \vDash d$。一个键属于 $\operatorname{dom}(\sigma_{\gamma})$，当且仅当某个 $\mathsf{Active}$ 纤程已经安装了它；纤程的供给是它可能安装的键，而不是它已经安装的键，因此 $\gamma \vDash d$ 已经要求每个声明的键都有一个 $\mathsf{Active}$ 提供者。只对 $\mathsf{Active}$ 纤程取并集，使一个纤程能够在尚未撤回任何内容之前就停止提供；第 4.3.1 节会把这一点转化为顺序规则。

### 4.2. 基础演算

本节只给出图 1 所示双状态生命周期的演算：每个纤程用来比较的目标，以及推动它前进的五条规则。

**目标视图。** 规则会把每个纤程与一个目标进行比较；该目标说明它是否应该运行，以及应当针对其依赖的哪一种解析结果运行。目标并非单个纤程自身的性质，因为纤程所声明的键需要针对整个状态进行解析；因此，目标是该状态上的一个谓词。

**定义 46.** $n$ 在 $\gamma$ 处的目标视图把每个声明的键映射到其提供者，因而是一个从 $d_n$ 到 $\mathfrak{N}$ 的全映射；当 $n$ 根本不应运行时，目标视图为 $\bot$：

$$
\operatorname{target}_n(\gamma)
\coloneqq
\begin{cases}
\bot,
& \text{若 } \tau_n \lor \neg(\gamma \vDash d_n), \\[2pt]
(k \in d_n) \mapsto \operatorname{provider}_k(\gamma),
& \text{其他情况。}
\end{cases}
\tag{41}
$$

当每个纤程都已到达其目标视图时，状态是静止的：

$$
\operatorname{quiet}(\gamma)
\coloneqq
\forall n \in \operatorname{dom}(F_{\gamma}).
\begin{cases}
\operatorname{target}_n(\gamma) = \bot,
& \text{若 } \theta_n = \mathsf{Inactive}, \\[2pt]
\operatorname{target}_n(\gamma) = \omega_n,
& \text{若 } \theta_n = \mathsf{Active}(-,\omega_n).
\end{cases}
\tag{42}
$$

目标仅取决于两件事，除此之外不取决于任何内容：一是经由 $\tau_n$ 表示的退役状态，二是经由 $\gamma \vDash d_n$ 与 $\operatorname{provider}_k$ 表示的余效解析；每个声明的键，都从定义 43 的单一共享隔离域中的 $\sigma_{\gamma}$ 读出。

定义 44 的已提交视图与目标视图具有相同的类型，而生命周期由二者的比较驱动：$\omega_n$ 是 $n$ 激活时所针对的解析结果，$\operatorname{target}_n(\gamma)$ 则是它现在应当针对其运行的解析结果；以下每条规则都会依据二者相同或不同而触发。记录提供者而非值，才使这种比较可用；否则，由另一个纤程提供的相等值也会被比较为相等。组件所读取的值经由该视图取得，因为提供者的表保存着该值；实现则把这一映射保存在 `fiber.committed` 中，并把它的哈希值保存在 `fiber.target` 中（第 5.1.3 节）。

**规则。** 基础演算假定每次迁移都是原子的、即时的且不会失败：一次激活会在单个步骤中应用其效应函数，一次停用会在单个步骤中应用累加器，并且二者都必定成功。第 4.3 节将放宽这三项假设。

五条规则生成两种关系。以 `O-` 为前缀、记作 $\gamma \Rightarrow \delta$ 的编排规则，是编排器可以执行的动作；其前提说明该动作何时合法，而不是它何时发生。以 `L-` 为前缀、记作 $\gamma \longrightarrow \delta$ 的生命周期规则，是系统在其前提成立时自行采取的步骤。一个步骤序列会将这两类步骤交错起来，而下文的 $\longrightarrow^{*}$ 仅表示生命周期步骤。

$$
\frac{
\begin{gathered}
n \notin \operatorname{dom}(F_{\gamma}) \\
\pi \in \operatorname{dom}(F_{\gamma}) \cup \{\mathsf{root}\} \\
(d,p,e) \in \mathfrak{C}_{\Gamma} \\
\forall m \in \operatorname{dom}(F_{\gamma}).\ p \cap p_m = \varnothing
\end{gathered}
}{
\gamma \Rightarrow
\gamma[n \mapsto \langle d,p,e,\pi,\varnothing,\bot,\mathsf{Inactive} \rangle]
}
\;\mathrm{O\text{-}Insert}
$$

$$
\frac{
n \in \operatorname{dom}(F_{\gamma})
}{
\gamma \Rightarrow \gamma[\tau_n \mapsto \top]
}
\;\mathrm{O\text{-}Retire}
$$

$$
\frac{
\begin{gathered}
\tau_n = \top \\
\theta_n = \mathsf{Inactive} \\
\forall m.\ \pi_m \neq n
\end{gathered}
}{
\gamma \Rightarrow \gamma \setminus n
}
\;\mathrm{O\text{-}Remove}
$$

插入与退役是仅有的外部输入：编排器请求某个纤程存在或停止存在，但绝不会直接设置其生命周期状态。`O-Retire` 不以纤程的状态为条件，因为退役只是一项请求，而真正执行这项请求的是生命周期规则。出于同样的原因，退役与移除彼此分离：一个已经退役但仍处于 $\mathsf{Active}$ 状态的纤程，必须先停用；过早移除它会丢弃累加器并导致泄漏。前提 $\forall m.\ \pi_m \neq n$ 要求先移除子级再移除父级，从而保持树结构良构。`O-Insert` 的最后一个前提施加了单一来源规则：编排器不得接纳第二个声明同一键的组件，因此一个键只有一个可能的提供者。

$$
\frac{
\begin{gathered}
\theta_n = \mathsf{Inactive} \\
\omega = \operatorname{target}_n(\gamma) \neq \bot \\
e_n(\gamma) = (\delta,g)
\end{gathered}
}{
\gamma \longrightarrow
\delta[\theta_n \mapsto \mathsf{Active}(g,\omega)]
}
\;\mathrm{L\text{-}Reload}
$$

$$
\frac{
\begin{gathered}
\theta_n = \mathsf{Active}(g,\omega) \\
\operatorname{target}_n(\gamma) \neq \omega \\
g(\gamma) = \delta
\end{gathered}
}{
\gamma \longrightarrow
\delta[\theta_n \mapsto \mathsf{Inactive}]
}
\;\mathrm{L\text{-}Unload}
$$

`L-Reload` 在安装逆函数的同时安装已提交视图；`L-Unload` 应用逆函数并丢弃已提交视图。两者都由同一种比较驱动：当纤程没有已提交视图且其目标视图不为 $\bot$ 时，`L-Reload` 触发；当纤程持有的已提交视图不等于其目标视图时，`L-Unload` 触发。这就是第 3.2 节的反应式规则，只不过它读取的目标除了响应余效之外，也会响应退役状态：只要目标视图发生变化，就会启动一次迁移，而不论是哪一方面使它发生了变化。

**实例化。** 一个组件在安装自身效应时，可以实例化另一个组件；插件宿主在某个插件加载它自己的插件时，做的正是这件事。到目前为止，规则只允许编排规则修改注册表，因此这种实例化无处发生。下面用一个原语为它提供发生的位置。

**定义 47.** 对 $e_n$ 的一次应用——或者在第 4.3.2 节适用时，它的某一次迭代——可以注册一个组件 $(d,p,e) \in \mathfrak{C}_{\Gamma}$。它不采用状态映射，而是采用该组件在 $\pi=n$ 条件下的 `O-Insert`，并以对注册所得纤程执行的 `O-Retire` 作为逆操作。该规则在满足 `O-Insert` 新鲜性前提的条件下抽取一个名称，并将该名称交给效应函数。

逆操作执行退役而非移除，原因在于逆操作无论在何处被执行，都必须能够适用。`O-Remove` 带有前提，因此用它构造的逆操作可能无法适用：若父级的子级仍处于 $\mathsf{Active}$ 状态，父级就无法运行其累加器；同时也没有任何规则会推进该子级，因为定义 46 并不读取纤程树。`O-Retire` 的唯一前提是 $n \in \operatorname{dom}(F_{\gamma})$。当状态回到进行注册时所取用的状态后，该逆操作留下的条目已经退役，处于 $\mathsf{Inactive}(\bot)$ 状态，并持有一张空表；这就是引理 57 的残留条目：它与纤程不存在的状态仅在控制字段上有所不同，并且没有任何规则能够区分二者。

让一个子级退役会设置 $\tau$，从而使其目标视图变为 $\bot$，之后普通规则会把它带回 $\mathsf{Inactive}$。由于 `O-Retire` 是无条件的，父级不会被迫等待；因此，无论子级是否已经离开，`L-Unload` 都可以应用于父级。孙级则逐层触达：子级自己的累加器会让该子级所注册的组件退役。定理 66 会同时涵盖这一连锁过程，以及第 4.3.1 节沿余效施加的连锁过程。

**局限性。** 有了上述唯一的例外之后，就可以规定效应函数必须遵守的规则。它一方面限制一次应用可以写入的内容，使应用该函数的规则能够涵盖其他所有变化；另一方面限制一次应用可以读取的内容，使纤程只能看到自己所声明的余效，而不能看到注册表中的更多内容。限制写入，正是第 4.4 节能够把表 1 视作完整写入清单的原因。

**定义 48.** 若映射 $f : \Gamma \to \Gamma$ 对每个满足 $n \in \operatorname{dom}(F_{\gamma})$ 的 $\gamma \in \Gamma$，令 $\delta=f(\gamma)$ 后都满足以下条件，则称 $f$ **局限于** $n$：

1. **（写入。）** $\operatorname{dom}(F_{\delta}) = \operatorname{dom}(F_{\gamma})$；对于每个满足 $m \neq n$ 的 $m \in \operatorname{dom}(F_{\gamma})$，都有 $\delta(m)=\gamma(m)$；而 $\delta(n)$ 与 $\gamma(n)$ 仅在 $\sigma$ 上有所不同。

2. **（读取。）** 若两个状态在 $\sigma_n$、每个 $m \in \operatorname{dom}(F_{\gamma})$ 的限制 $\left.\sigma_m\right|_{d_n}$，以及状态中未被任何纤程表命名的部分上都一致，则 $f$ 会把它们映射到仍在这三方面一致的状态。

若效应函数 $e$ 的每一次应用——以及在第 4.3.2 节适用时，它的每一次迭代——要么注册一个组件（定义 47），要么其状态映射 $\operatorname{pr}_1 \circ e$ 与它所产生的逆函数都局限于 $n$，则称 $e$ 局限于 $n$。每个纤程的效应函数都必须局限于该纤程。

一次注册只会在其抽取的那个名称处写入 `O-Insert` 所写入的条目，除此之外不写入任何内容；作为逆操作产生的 `O-Retire` 只会写入该名称对应的 $\tau$，除此之外也不写入任何内容。因此，这两类应用都不会写入状态中已存在纤程的任何控制字段，唯一例外是上述一个 $\tau$；它们也根本不读取任何控制字段。

条款 (2) 说明了组件为何可以读取其声明的值：这些值位于其提供者的表中，因此，如果效应函数除了 $\sigma_n$ 之外不能读取任何表，它就无法使用自己的余效。它不能读取的是 $d_n$ 之外的表内容以及任何控制字段；这可以阻止组件根据一个自己并未声明的纤程之生命周期状态进行分支。

这些规则是非确定性的：可能有多个纤程所持有的已提交视图不同于其目标视图，而该关系并不规定它们之间的执行顺序。这些规则也仅仅是反应式的，因为没有任何规则提到调度器；步骤可以是任意规则应用序列，所以，针对所有这类序列证明的定理，对运行时可能采用的每一种调度策略都成立。

### 4.3. 进行中的迁移

本节在四种情形下扩展基础演算。第一种情形补充了第 3.2 节所要求、但第 4.2 节无法表达的内容：一次停用可以延展为一段时间区间，而它的依赖者可以在这段区间内完成自己的停用。其余三种情形则放弃了“迁移是原子的、即时的且不会失败”这一理想化假设；真实运行时中的迁移并不具备其中任何一项性质。这里放弃的是“整个迁移只包含一个步骤”，而不是“一步只应用一条规则”；四种情形具有同一个结构性后果，这里统一处理：如果一次迁移不是一个步骤，那么它在进行期间就需要占据一个状态，并且迁移可能运行的每个方向都各需一个这样的状态。

**定义 49.** 本节的生命周期状态将 $\Theta_{\Gamma}$ 替换为：

$$
\Theta_{\Gamma}
\coloneqq
\mathsf{Inactive}(\zeta)
\mid
\mathsf{Reloading}(i,g,\omega)
\mid
\mathsf{Active}(g,\omega)
\mid
\mathsf{Unloading}(g,\omega,\zeta),
\tag{43}
$$

其中，$i : \mathfrak{E}^{\mathrm{iter}*}_{\Gamma}$ 是剩余的效应迭代器（见下文定义 51），$g : \Gamma \to \Gamma$ 是目前为止构建出的累加器，$\omega : d \to \mathfrak{N}$ 是已提交视图，而 $\zeta : \{\bot\} \cup \Xi$ 是结果：$\mathsf{Unloading}$ 携带的是其停用过程将要抵达的结果，$\mathsf{Inactive}$ 携带的是其已经抵达的结果；该结果要么是 $\bot$，要么是从错误集合 $\Xi$ 中取得的一个错误——第 4.3.4 节会引入这一错误集合。

当纤程处于三个携带累加器和已提交视图的状态之一时，称该纤程已安装；当它携带一个错误结果时，称该纤程已失败：

$$
\begin{aligned}
\operatorname{installed}_n(\gamma)
&\coloneqq
\theta_n \neq \mathsf{Inactive}(-), \\
\operatorname{failed}_n(\gamma)
&\coloneqq
\exists \xi \in \Xi.\ \theta_n = \mathsf{Inactive}(\xi).
\end{aligned}
\tag{44}
$$

若已安装的纤程 $n$ 满足 $\omega_n(k)=m$，则称它把 $k$ 解析到 $m$。定义 46 的静止性在这个更宽的状态空间上解读为：

$$
\operatorname{quiet}(\gamma)
\coloneqq
\forall n \in \operatorname{dom}(F_{\gamma}).
\begin{cases}
\zeta \neq \bot \lor \operatorname{target}_n(\gamma)=\bot,
& \text{若 } \theta_n=\mathsf{Inactive}(\zeta), \\[2pt]
\operatorname{target}_n(\gamma)=\omega_n,
& \text{若 } \theta_n=\mathsf{Active}(-,\omega_n), \\[2pt]
\bot,
& \text{其他情况。}
\end{cases}
\tag{45}
$$

第 4.1 节的各项定义都延续到这个状态空间上，但需要明确两种解读。第一，第 4.2 节的 $\mathsf{Inactive}$ 在 `O-Insert` 的结论中读作 $\mathsf{Inactive}(\bot)$，在 `O-Remove` 的前提中读作 $\mathsf{Inactive}(-)$。第二，$\sigma_{\gamma}$ 仍然只对 $\mathsf{Active}$ 纤程的表取并集；因此，无论迁移正在沿哪个方向进行，处于迁移中的纤程都通过自己持有的 $\omega$ 读取余效，而不提供自己的任何余效。于是，即使它的迁移已经写入了某个键，该键也尚不能成为依赖者激活时所依据的键。在双状态演算中，这一区分不存在，因为其中每个已安装纤程都处于 $\mathsf{Active}$ 状态。

图 2 描绘了这些状态所形成的生命周期，下面四个小节则给出其各条边上的规则。

![图 2：带有进行中迁移的生命周期；两种迁移状态以边框标出](/images/spatiotemporal-composability/figure-2-lifecycle-transitions.png)

<p class="figure-caption">图 2｜带有进行中迁移的生命周期；两种迁移状态以边框标出</p>

### 4.3.1. 撤回

第 3.2 节要求：依赖方应当在其依赖项之后激活，而被依赖项只有在其依赖方停用之后，才能撤回自身提供的内容。前一半在基础演算中已经成立：一次激活要求 $\gamma \vDash d_n$，因此，声明需要 $k$ 的纤程不可能在某个纤程开始活跃地提供 $k$ 之前激活。后一半才是实质性要求，而且它所保证的不能只是状态变更的先后顺序。当一个组件因为其提供方即将离开而被拆卸时，它正在运行自己的拆卸代码，而这些代码可能仍然需要正在被撤回的那个余效；例如，关闭连接池通常意味着把连接交还给原先提供这些连接的对象。后一半所必须保证的是：消费者在自身停用的全过程中仍能读取 $k$，而提供方对 $k$ 的撤回只有在这之后才会生效。基础演算完全无法提供这一保证：其中的 L-Unload 会同时移除供给并运行逆函数，二者之间没有留下任何可供消费者执行拆卸操作的时间区间。

本层将该步骤一分为二，并用下列条件守卫其后半部分。

**定义 50.** 当某个其他已安装纤程把一个键解析到纤程 $n$ 时，称纤程 $n$ 在 $\gamma$ 处被依赖：

$$
\operatorname{relied}_n(\gamma) \coloneqq
\exists m \in \operatorname{dom}(F_\gamma),\; k \in d_m.\;
m \ne n \land \operatorname{installed}_m(\gamma) \land \omega_m(k) = n
\tag{46}
$$

$$
\frac{
  \theta_n = \mathsf{Active}(g, \omega)
  \qquad
  \operatorname{target}_n(\gamma) \ne \omega
}{
  \gamma \longrightarrow
  \gamma[\theta_n \mapsto \mathsf{Unloading}(g, \omega, \bot)]
}
\qquad \mathrm{L\text{-}Leave}
$$

$$
\frac{
  \theta_n = \mathsf{Unloading}(g, \omega, \zeta)
  \qquad
  \neg \operatorname{relied}_n(\gamma)
  \qquad
  g(\gamma) = \delta
}{
  \gamma \longrightarrow
  \delta[\theta_n \mapsto \mathsf{Inactive}(\zeta)]
}
\qquad \mathrm{L\text{-}Unload}
$$

L-Leave 只记录停用决定而不立即执行停用：它让该纤程停止提供自身的余效，同时保持该纤程自己的已提交视图以及其他所有纤程的已提交视图不变。L-Unload 应用累加器、丢弃已提交视图，并使该纤程以其携带的结果进入 $\mathsf{Inactive}$；在第 4.3.4 节给出另一种情形之前，该结果始终为 $\bot$。它是演算中唯一一条应用累加器的规则。

于是，顺序要求的两个部分由该形式中的不同部分分别承担：可见性部分由已提交视图承担，而 L-Unload 会把丢弃该视图作为它的最后一个动作；顺序部分则由前提 $\neg \operatorname{relied}_n(\gamma)$ 承担，我们将这个前提称为**守卫**。它会阻止 $k$ 被撤回，直至所有把 $k$ 解析到 $n$ 的消费者都已离开。定理 63 将同时确立这两个部分。

守卫是按绑定而不是按纤程施加的：$\operatorname{relied}_n(\gamma)$ 检查是否有某个已提交视图指向 $n$，因此，不声明 $n$ 所提供之任何键的纤程不会构成阻碍；在另一个隔离域中解析了 $n$ 的某个键的纤程同样不会构成阻碍（第 3.2.3 节）。在第 4.2 节的单一来源约束下，这种按绑定的解读与下列更粗粒度的检查等价，因为在那里一个键只有一个可能的提供方：

$$
\exists m \ne n,\; k \in d_m.\;
\operatorname{installed}_m(\gamma) \land k \in p_n.
$$

这种守卫通常会导致死锁。使这里免于死锁的是 $\mathsf{Unloading}$，以及 $\sigma_\gamma$ 只对处于 $\mathsf{Active}$ 状态的纤程取并集这一事实：一旦 L-Leave 标记了 $n$，它的表便会从 $\sigma_\gamma$ 中离开，于是任何目标视图都不再可能指向 $n$，而所有已经提交到 $n$ 的消费者也都会开始退出。定理 66 会把这一事实转化为守卫总能解除的结论。

守卫沿余效关系而不是沿纤程树来安排停用顺序：当一个子纤程仍处于 $\mathsf{Unloading}$ 状态时，其父纤程就可能运行自己的逆函数，因为 $\operatorname{relied}$ 只涉及已提交视图。因此，父子纤程之间的顺序约束弱于定理 63 对提供方与消费者施加的顺序约束；若父纤程与子纤程的效应在环境状态中相遇，则二者改由定义 60 的独立性假设约束。

### 4.3.2. 迭代

一次激活可能依次执行多个效应，而停用必须将这些效应恢复。我们用效应迭代器对这种激活建模；它的每次迭代都会产出修改后的上下文、一个逆函数和一个续延：

**定义 51.** 将效应迭代器 $\mathfrak{E}^{\mathrm{iter}}_\Gamma$ 和带见证的效应迭代器 $\mathfrak{E}^{\mathrm{iter}*}_\Gamma$ 定义为下列递归类型：

$$
\mathfrak{E}^{\mathrm{iter}}_\Gamma
\coloneqq
\mu \mathfrak{I}.\;
\Gamma \to \Gamma \times (\Gamma \to \Gamma)
\times \mathsf{Maybe}(\mathfrak{I})
$$

$$
\begin{aligned}
\mathfrak{E}^{\mathrm{iter}*}_\Gamma
\coloneqq {} & \mu \mathfrak{I}.\;
\bigl(e : \Gamma \to \Gamma \times (\Gamma \to \Gamma)
\times \mathsf{Maybe}(\mathfrak{I})\bigr) \\
& \times \Bigl((\gamma : \Gamma) \to
  \bigl(\mathbf{let}\; (\delta, g, o) = e(\gamma)\;
  \mathbf{in}\; g(\delta) \simeq \gamma\bigr)\Bigr).
\end{aligned}
\tag{47}
$$

其中，$e(\gamma)$ 产出一个三元组 $(\delta,g,o)$，其含义为：

- $\delta$ 是新的上下文；
- $g$ 是当前效应的逆函数；
- $o$ 表示续延：

  - $\mathsf{Nothing}$ 表示迭代终止；
  - $\mathsf{Just}(i)$ 给出下一次迭代。

这里的见证是在定义 33 的 $\simeq$ 上解读的，方式与定义 37 解读 $\mathfrak{E}^{*}_\Gamma$ 的见证相同：当 $i$ 尊重 $\simeq$，且它所产出的每个 $g$ 也尊重 $\simeq$ 并满足上述子句时，$i \in \mathfrak{E}^{\mathrm{iter}}_\Gamma$ 属于 $\mathfrak{E}^{\mathrm{iter}*}_\Gamma$。两个三元组按分量比较；$\mathsf{Nothing}$ 只能与 $\mathsf{Nothing}$ 比较，而当 $i \simeq i'$ 时，$\mathsf{Just}(i)$ 与 $\mathsf{Just}(i')$ 比较。迭代器上的 $\simeq$ 是满足这些子句的最大关系。当把 $\Gamma$ 上的 $\simeq$ 取为相等关系时，就恢复了严格相等意义下的解读。

效应迭代器变换 $\operatorname{effect}^{\mathrm{iter}}_\Gamma$ 通过递归调用，把 $\operatorname{effect}_\Gamma$ 扩展到迭代器结构上：

**定义 52.** 效应迭代器变换 $\operatorname{effect}^{\mathrm{iter}}_\Gamma$ 定义为：

$$
\begin{aligned}
\operatorname{effect}^{\mathrm{iter}}_\Gamma
&:\; \mathfrak{E}^{\mathrm{iter}}_\Gamma
\to \partial \Gamma
\to \partial^2 \Gamma, \\
\operatorname{effect}^{\mathrm{iter}}_\Gamma
&= i \mapsto (\gamma, \varphi) \mapsto \\
&\quad \mathbf{let}\; (\delta, g, o) = i(\gamma)\; \mathbf{in} \\
&\quad \mathbf{let}\; t = \operatorname{track}_\Gamma
  (g, \operatorname{pr}_1 \circ i)\; \mathbf{in} \\
&\quad \mathbf{match}\; o \\
&\qquad |\; \mathsf{Nothing} \Rightarrow
  ((\delta, \varphi \circ g), t) \\
&\qquad |\; \mathsf{Just}(i') \Rightarrow
  \mathbf{let}\; (s,r) =
  \operatorname{effect}^{\mathrm{iter}}_\Gamma(i')
  (\delta, \varphi \circ g)\; \mathbf{in} \\
&\hspace{12.9em} (s, t \circ r).
\end{aligned}
\tag{48}
$$

在每次迭代中，逆函数 $g$ 都按应用顺序复合到 $\varphi$ 上，因此累加器 $\varphi \circ g_1 \circ \cdots \circ g_k$ 在被应用时，会自然地以后进先出（LIFO）顺序恢复各项效应。由于 $\operatorname{effect}^{\mathrm{iter}}_\Gamma$ 的值域与 $\operatorname{effect}_\Gamma$ 相同，都是 $\partial \Gamma \to \partial^2 \Gamma$，因此迭代器本身也是一种效应，可以用在任何能够使用效应的地方。组件的整次激活就是其中一种用法，本节其余部分将对此形式化；实现则允许在每个变更点使用迭代器（第 5.1.1 节）。$\mathsf{Maybe}(\mathfrak{E}^{\mathrm{iter}})$ 形式的续延在任意两次连续迭代之间提供了一个边界；在该边界处，上下文正是此前各次迭代共同产生的结果，而累加器恰好能恢复这些迭代，且不会恢复更多内容。从这个意义上说，效应迭代器是一种具体化的定界续延；主流语言通过 `yield` 运算符 [43] 暴露的正是这种结构，因此该模型可以直接对应到这些语言已经提供的生成器上。

从这里开始，演算中的定义 44 所给出的 $e_n$ 按 $\mathfrak{E}^{\mathrm{iter}*}_\Gamma$ 解读；用迭代器替换原子效应函数后，基础规则 L-Reload 被拆分，使执行迹经过一个已经开始的状态，并让纤程有了离开该状态的第二种方式。

$$
\frac{
  \theta_n = \mathsf{Inactive}(\bot)
  \qquad
  \omega = \operatorname{target}_n(\gamma) \ne \bot
}{
  \gamma \longrightarrow
  \gamma[\theta_n \mapsto
  \mathsf{Reloading}(e_n, \operatorname{id}_\Gamma, \omega)]
}
\qquad \mathrm{L\text{-}Begin}
$$

$$
\frac{
  \begin{gathered}
  \theta_n = \mathsf{Reloading}(i,g,\omega)
  \qquad
  \operatorname{target}_n(\gamma) \ne \omega \\
  (\delta,h) = (\gamma, \operatorname{id}_\Gamma)
  \;\lor\;
  i(\gamma) = (\delta,h,{\text{-}})
  \end{gathered}
}{
  \gamma \longrightarrow
  \delta[\theta_n \mapsto
  \mathsf{Unloading}(g \circ h, \omega, \bot)]
}
\qquad \mathrm{L\text{-}Divert}
$$

$$
\frac{
  \begin{gathered}
  \theta_n = \mathsf{Reloading}(i,g,\omega)
  \qquad
  \operatorname{target}_n(\gamma) = \omega \\
  i(\gamma) = (\delta,h,\mathsf{Just}(i'))
  \end{gathered}
}{
  \gamma \longrightarrow
  \delta[\theta_n \mapsto
  \mathsf{Reloading}(i', g \circ h, \omega)]
}
\qquad \mathrm{L\text{-}Iter}
$$

$$
\frac{
  \begin{gathered}
  \theta_n = \mathsf{Reloading}(i,g,\omega)
  \qquad
  \operatorname{target}_n(\gamma) = \omega \\
  i(\gamma) = (\delta,h,\mathsf{Nothing})
  \end{gathered}
}{
  \gamma \longrightarrow
  \delta[\theta_n \mapsto
  \mathsf{Active}(g \circ h, \omega)]
}
\qquad \mathrm{L\text{-}Finish}
$$

每次迭代都会按照定义 52，把新产出的逆函数以 $g \circ h$ 的形式复合到累加器上，从而让累加器以后进先出的顺序应用这些逆函数。在任意两次连续迭代之间，如果目标视图已经改变，系统就可以使该迁移转向，并应用目前累积的逆函数来恢复上下文。L-Divert 不会就地应用累加器，而是像其他所有停用一样，经由 $\mathsf{Unloading}$ 改道；它在那里遇到的守卫条件是平凡成立的，因为一个从未处于 $\mathsf{Active}$ 状态的纤程不提供任何内容，也不会出现在任何已提交视图中。L-Divert 的两个备选分支中，第一个会中止纤程当前持有的迭代；只有迭代边界才使这种中止成为可能，因此转向所能落下的粒度就是迭代器的粒度。第二个分支则允许该次迭代落定，第 4.3.3 节将说明为什么需要这个分支。

普通效应函数（$\mathfrak{E}_\Gamma$）是一种退化情形，其第一次迭代就会产出 $\mathsf{Nothing}$。这样的迁移仍会经过 $\mathsf{Reloading}$，L-Divert 仍然适用于该状态；但此时累加器是 $\operatorname{id}_\Gamma$，而且尚未运行任何迭代，因此不会恢复任何内容，该迁移要么安装其全部效应，要么一个也不安装。

### 4.3.3. 异步性

此前各层允许环境在一次迭代结束与下一次迭代开始之间发生变化，同时假定每次迭代自身都会瞬时完成，即启动与落定发生在同一个步骤中。我们对非即时性作抽象建模：一次迭代产出一个类型为 $\mathsf{Future}(A)$ 的值，其中 $\mathsf{Future}$ 是不透明的类型构造器；它的定义性性质是，在提交与完成之间，外部状态可能发生改变。

在这一模型下，一次迭代在某个状态下启动，在另一个状态下落定；在它处于执行中的这段时间里，纤程处于 $\mathsf{Reloading}$ 状态。本层增加的是**惯性**：一旦启动，一次迭代就必定落定，而且不能拒绝它的落定。因此，如果目标视图在执行期间发生转变，就不能通过中止该迭代来响应，而只能采用 L-Divert 中允许该迭代落定的那个备选分支：迭代先落定，随后纤程再停用。所以，本层没有增加任何规则，也没有增加任何供规则匹配的新类型；在 $\Gamma$ 的粒度上，惯性的全部内容就在于此，其形式是限制宿主能够选择 L-Divert 的哪一个备选分支。

这个备选分支正是基础演算无法表达的情形。在基础演算中，当迁移发现其目标视图已经转变时，会在发现它的同一步中撤销自身；而在这里，正在执行的迭代必须先落定，因此纤程需要一个状态来停留，以便运行它的逆函数。唯一健全的选择是进入 $\mathsf{Unloading}$，并让该状态持有此次迭代所产生的逆函数。如果改为经由 $\mathsf{Active}$，纤程就会在一个步骤的时长内提供自己的余效，并迫使其依赖方针对一个已经准备离开的组件执行激活。这对应于实现中 `reload` 与 `unload` 的相互链式调用。

一次停用也可以直接链回一次激活；这是通过规则复合而不是一条单独规则实现的。L-Unload 对目标视图没有任何前提，因此，无论纤程停用期间目标视图变成了什么，累加器都会运行，纤程也都会进入 $\mathsf{Inactive}$；随后 L-Begin 可以立即开始一次新的迁移。

### 4.3.4. 失败

到目前为止，每条规则都假定它所运行的效应会成功，但运行时不能作此假定。组件所安装的效应会触及追踪这些效应的上下文之外，而它们所触及的对象可能拒绝操作：端口可能已经被占用，文件可能并不存在，对端也可能没有响应。即使迁移失败，也必须恢复纤程的效应，而不能让这些效应滞留。

令 $\Xi$ 为错误的集合，并对定义 51 的效应迭代器加以精化，使一次迭代可以抛出错误，而不必产出三元组：

$$
\mathfrak{E}^{\mathrm{fail}}_\Gamma
\coloneqq
\mu \mathfrak{I}.\;
\Gamma \to \mathsf{Either}
\bigl(\Xi, \Gamma \times (\Gamma \to \Gamma)
\times \mathsf{Maybe}(\mathfrak{I})\bigr)
$$

$$
\begin{aligned}
\mathfrak{E}^{\mathrm{fail}*}_\Gamma
\coloneqq {} & \mu \mathfrak{I}.\;
\Bigl(e : \Gamma \to \mathsf{Either}
\bigl(\Xi, \Gamma \times (\Gamma \to \Gamma)
\times \mathsf{Maybe}(\mathfrak{I})\bigr)\Bigr) \\
& \times \Bigl((\gamma : \Gamma) \to
  \bigl(\mathbf{let}\; \mathsf{Right}(\delta,g,o) = e(\gamma)\;
  \mathbf{in}\; g(\delta) \simeq \gamma\bigr)\Bigr).
\end{aligned}
\tag{49}
$$

该见证只约束 $\mathsf{Right}$ 情形；在模式不匹配时，约束平凡成立，因为一次抛错没有任何需要撤销的内容。从这里开始，$\mathsf{Reloading}$ 所携带的 $i$ 按 $\mathfrak{E}^{\mathrm{fail}*}_\Gamma$ 解读。定义 52 的提升也可直接沿用，只需在原本产出三元组的位置传播抛错；因此，正如普通迭代器一样，会抛错的迭代器也可以用在任何能够使用效应的地方。本层增加一条规则，并让定义 49 中的第二种结果得到使用；O-Remove 无需扩宽便可容纳这种结果。L-Iter、L-Finish 和 L-Divert 的前提则改为在它们所匹配的三元组外包一层 $\mathsf{Right}$ 来解读。抛错是一次迭代所做的事情，因此这条规则是从 $\mathsf{Reloading}$ 状态离开的一条出口。

$$
\frac{
  \theta_n = \mathsf{Reloading}(i,g,\omega)
  \qquad
  i(\gamma) = \mathsf{Left}(\xi)
}{
  \gamma \longrightarrow
  \gamma[\theta_n \mapsto \mathsf{Unloading}(g,\omega,\xi)]
}
\;\mathrm{L\text{-}Raise}
$$

L-Raise 先恢复，再记录。纤程进入 $\mathsf{Unloading}$，并将错误作为其结果携带过去；在那里，会应用截至失败迭代为止所构建的累加器。最终，纤程在未安装任何内容的情况下到达 $\mathsf{Inactive}(\xi)$；此时的状态与中止型 L-Divert 所产生的状态相比，唯一差异是纤程所携带的结果。像处理其他所有停用一样为失败安排路径，能够确保任何结果都只能经由 L-Unload 到达；定理 59 所依赖的唯一事实正是这一点。L-Begin 以 $\mathsf{Inactive}(\bot)$ 为前提，因此生命周期不会从错误结果重新进入。这正是该结果的实质：若某个纤程的效应函数已经表明，对于它执行时所面对的状态而言，该函数并不可靠，那么系统会扣留该纤程，而不是在未发生变化的环境中重试它。失败的纤程也不会阻碍任何事物：它处于 $\mathsf{Inactive}$，因而不携带已提交视图，也无法使 $\operatorname{relied}$ 成立。

失败记录在纤程上，而不会传播至其父纤程；因此，一个组件的迁移失败后，其兄弟组件仍会继续运行。这正是插件宿主所期望的行为，也是结果属于各个纤程而非整个状态之属性的原因。

### 4.4. 元理论

第 4.3 节给出了十条规则：第 4.2 节的三条编排规则；用于激活的 L-Begin、L-Iter 和 L-Finish；表示激活提前结束的两种方式 L-Divert 和 L-Raise；以及用于停用的 L-Leave 和 L-Unload。本节从这些规则中读出两种可组合性的全局形式：无论其他纤程在其间做了什么，单个纤程的保证都仍然成立；此外，本节还加入了只有整个系统才能被要求满足的性质：系统总能到达其目标所要求的配置，并且该配置与静态组装所产生的配置相同。下文每项性质都是步骤序列的性质，因此我们为步骤编制索引，并从该索引读取状态的各个字段。

有两项约定将第 3.3.2 节带入本节。下文状态之间的每个等式，都像引理 38 解读第 3.1 节中的等式那样，在定义 33 的观察等价 $\simeq$ 意义下解读。效应函数应满足的见证条件采用定义 37 所给出的条件；对于迭代器，按定义 51 解读；对于注册型迭代，则按下文的 $\approx$ 解读。

**定义 53.** 以 $t$ 为步骤编号，使得 $\gamma^t$ 表示前 $t$ 个步骤到达的状态，并记

$$
\operatorname{step}^t \coloneqq r(n)
\tag{50}
$$

表示在 $\gamma^t$ 处采取的步骤：它应用十条规则之一的规则 $r$，并在名称 $n \in \mathfrak{N}$ 处应用该规则。序列始于满足 $\operatorname{dom}(F^0)=\varnothing$ 的 $\gamma^0$，因此，每个纤程都由一次 O-Insert 创建——无论该 O-Insert 是由编排器执行，还是由某次迭代执行（定义 47）。$\gamma^t$ 的字段将该索引写作上标：$\theta_n^t$、$\omega_n^t$、$\sigma_n^t$、$g_n^t$ 和 $i_n^t$ 分别表示 $\gamma^t$ 处 $n$ 的生命周期状态、已提交视图、表、累加器和剩余迭代器；$F^t$ 和 $\sigma^t$ 则分别表示 $\gamma^t$ 自身的注册表和余效上下文，即在该状态处读取定义 45 的 $F_\gamma$ 和 $\sigma_\gamma$。谓词将状态作为参数、将其他所有内容作为下标，因此，$\operatorname{installed}_n^t$、$\operatorname{target}_n^t$、$\operatorname{relied}_n^t$ 和 $\operatorname{quiet}^t$ 分别表示定义 46、定义 49 和定义 50 中的谓词在 $\gamma^t$ 处的取值。$n$ 的一个活动期（episode），是 $\operatorname{installed}_n^t$ 始终成立的一个极大索引区间 $[b,u]$。该活动期在 $b$ 处开启，此处 $b>0$ 且 $\neg\operatorname{installed}_n^{b-1}$；由于 $F^0$ 为空，初始时没有任何纤程已安装。若 $\operatorname{installed}_n^u$ 成立而 $\operatorname{installed}_n^{u+1}$ 不成立，则该活动期在 $u$ 处闭合；序列中的最后一个活动期不一定会闭合。

第 4.3 节的每条规则都具有 $\gamma\longrightarrow\delta[\cdots]$ 形式的结论：前提从 $\gamma$ 计算出 $\delta$；若前提不执行任何计算，则令 $\delta$ 保持为 $\gamma$；方括号则编辑注册表中具名的字段。我们分别命名这两个部分，并将二者都视为整个 $\Gamma$ 上的映射。对于在 $\gamma^t$ 处由作用于 $n$ 的规则所执行的步骤，其状态映射为

$$
\Psi^t \coloneqq
\begin{cases}
\operatorname{pr}_1 \circ i,
  & \text{在 L-Iter、L-Finish 和迭代落定的 L-Divert 处},\\
g,
  & \text{在 L-Unload 处},\\
\operatorname{id}_\Gamma,
  & \text{在其他所有规则处},
\end{cases}
\tag{51}
$$

其中，$i$ 和 $g$ 是 $\theta_n^t$ 所携带的迭代器与累加器；编辑 $\operatorname{edit}^t : \Gamma \to \Gamma$ 则是将方括号视为函数：它把前提在 $\gamma^t$ 处计算出的值赋给方括号所指名的字段。因此，二者都由 $\operatorname{step}^t$ 与 $\gamma^t$ 共同确定，并且在每个状态上都有定义；正因如此，定理 61 和引理 71 才能在 $\gamma^t$ 之外的状态上求值它们。每个步骤都可分解为

$$
\gamma^{t+1} = \operatorname{edit}^t(\Psi^t(\gamma^t)).
\tag{52}
$$

例如，在 L-Unload 处，$\operatorname{edit}^t$ 是 $[\theta_n \mapsto \mathsf{Inactive}(\zeta)]$；在 O-Remove 处，它是移除操作 $\setminus n$。这正是后半部分被称为“编辑”而非“赋值”的原因。字段也沿同一道界线分成两类：一类是表 $\sigma_m$；O-Insert 创建 $m$ 并将其置空后，再无任何 $\operatorname{edit}^t$ 会写入该表。另一类是控制字段 $\theta_m$、$\tau_m$、$\pi_m$、$d_m$、$p_m$、$e_m$，以及 $\operatorname{dom}(F_\gamma)$；除了通过定义 47 的原语之外，再无任何 $\Psi^t$ 会写入这些字段。当两个状态除控制字段之外的所有内容均一致时，记作 $\gamma\approx\delta$。

关系 $\approx$ 并不是定义 33 的 $\simeq$，并且二者都不细化另一个关系，因为每个关系都会遗忘另一个关系必须保留的内容。恢复精确性是关于效应的断言，因此，$\approx$ 精确比较各张表与环境状态，而仅仅忽略注册表中关于哪些纤程安装了它们的记录。规则需要读取控制字段以决定自己是否适用，因此，$\simeq$ 必须保留这些字段；本节将它解读为定义 33 与以下两项一致性的合取：注册表的定义域一致，以及每个纤程的所有控制字段均一致：

$$
\gamma \simeq \delta
\;\coloneqq\;
\sigma_\gamma \simeq \sigma_\delta
\;\land\;
\operatorname{dom}(F_\gamma)=\operatorname{dom}(F_\delta)
\;\land\;
\forall n,\ c\in\{\theta,\tau,\pi,d,p,e\}.\;
c(\gamma(n)) \simeq_c c(\delta(n)).
\tag{53}
$$

对于函数类型的字段——例如 $e_n$ 和 $\theta_n$ 内的 $g$——按照定义 36 比较映射；对于迭代器，按照定义 51 比较；对于任何其他类型的字段，则按相等关系比较。下文的结果会同时在这两种关系下成立，每个关系各自对应状态的一半；引理 55 将一次性为全部十条规则建立 $\simeq$ 这一半。

表 1 将第 4.3 节的十条规则解读为上述写入操作。累加器、已提交视图和剩余迭代器都是 $\theta_n$ 的组成部分，因此，第三列也会记录对它们的写入。该表中的 $h$ 表示第四列中的迭代所产生的逆函数；在 L-Divert 中止该迭代时，$h=\operatorname{id}_\Gamma$。若由迭代器构造的 $\Psi^t$ 注册了一个纤程（定义 47），则该注册会在其抽取出的名称处携带 O-Insert 行所示的写入；若某次 L-Unload 的累加器退役了一个纤程，则它会携带 O-Retire 行所示的写入。下文的每次分类讨论都是对该表的一次查阅，其中有五项查阅反复出现，值得单独命名。

| 规则 | $\theta_n^t$ | $\theta_n^{t+1}$ | $\Psi^t$ | 被编辑的控制字段 |
| --- | --- | --- | --- | --- |
| O-Insert | 未定义 | $\mathsf{Inactive}(\bot)$ | $\operatorname{id}_\Gamma$ | $\operatorname{dom}(F_\gamma)$ |
| O-Retire | 无约束 | 不变 | $\operatorname{id}_\Gamma$ | $\tau_n$ |
| O-Remove | $\mathsf{Inactive}(-)$ | 未定义 | $\operatorname{id}_\Gamma$ | $\operatorname{dom}(F_\gamma)$ |
| L-Begin | $\mathsf{Inactive}(\bot)$ | $\mathsf{Reloading}(e_n,\operatorname{id}_\Gamma,\omega)$ | $\operatorname{id}_\Gamma$ | $\theta_n$ |
| L-Iter | $\mathsf{Reloading}(i,g,\omega)$ | $\mathsf{Reloading}(i',g\circ h,\omega)$ | $\operatorname{pr}_1\circ i$ | $\theta_n$ |
| L-Finish | $\mathsf{Reloading}(i,g,\omega)$ | $\mathsf{Active}(g\circ h,\omega)$ | $\operatorname{pr}_1\circ i$ | $\theta_n$ |
| L-Divert | $\mathsf{Reloading}(i,g,\omega)$ | $\mathsf{Unloading}(g\circ h,\omega,\bot)$ | $\operatorname{id}_\Gamma$ 或 $\operatorname{pr}_1\circ i$ | $\theta_n$ |
| L-Raise | $\mathsf{Reloading}(i,g,\omega)$ | $\mathsf{Unloading}(g,\omega,\xi)$ | $\operatorname{id}_\Gamma$ | $\theta_n$ |
| L-Leave | $\mathsf{Active}(g,\omega)$ | $\mathsf{Unloading}(g,\omega,\bot)$ | $\operatorname{id}_\Gamma$ | $\theta_n$ |
| L-Unload | $\mathsf{Unloading}(g,\omega,\zeta)$ | $\mathsf{Inactive}(\zeta)$ | $g$ | $\theta_n$ |

**表 1｜** 各条规则对其所作用的纤程 $n$ 所做的写入，其中 $\operatorname{step}^t$ 表示在 $n$ 处应用该规则。

**引理 54.** 将表 1 与定义 48 一并解读，则对每个步骤 $t$，以及 $\gamma^t$ 中存在的所有纤程 $m,n$，均有：

1. 仅当步骤 $t$ 作用于 $m$ 时，才可能有 $\sigma_m^{t+1} \ne \sigma_m^t$；该写入位于 $\Psi^t$ 内部。

2. $\omega_n$ 只会在 $\operatorname{step}^t=\text{L-Begin}(n)$ 时出现，只会在 $\operatorname{step}^t=\text{L-Unload}(n)$ 时消失；因此，在 $n$ 的一个活动期中，$\omega_n^t$ 关于 $t$ 保持不变。

3. 仅当 $\operatorname{step}^t=\text{L-Unload}(n)$ 时，才有 $\Psi^t=g_n^t$；没有其他步骤会将 $g_n$ 应用于状态。

4. $\neg\operatorname{installed}_n^t \land \operatorname{installed}_n^{t+1} \Rightarrow \operatorname{step}^t=\text{L-Begin}(n)$，并且 $\operatorname{installed}_n^t \land \neg\operatorname{installed}_n^{t+1} \Rightarrow \operatorname{step}^t=\text{L-Unload}(n)$。

5. $\pi_n$、$d_n$、$p_n$ 和 $e_n$ 与 $n$ 的条目同时出现，此后再也不会被写入；$\tau_n$ 是单调的，只会被写为 $\top$，且只有 O-Retire 会执行这一写入。

**证明。** 设 $\operatorname{step}^t$ 在 $n$ 处应用规则 $r$。根据定义 53，它可分解为 $\operatorname{edit}^t\circ\Psi^t$，其中，$\operatorname{edit}^t$ 恰好写入表 1 第五列所列的字段，而不写入其他字段；$\Psi^t$ 则是 $\operatorname{id}_\Gamma$、$n$ 的某次迭代的应用，或累加器 $g_n^t$，其中该累加器是这些迭代所产生之逆函数的复合。根据定义 48，这三者均局限于 $n$，因此，在 $\gamma^t$ 中已经存在的纤程里，$\Psi^t$ 除 $\sigma_n$ 外不会写入任何字段；此外，它还可能写入一次注册所添加的条目，以及该注册的逆函数所写入的 $\tau$。于是，这两个部分对写入进行了划分，而每个条款都只是针对某个字段读取这一划分。对第二、三列的一项解读将在下文使用两次：$\mathsf{Inactive}$ 是唯一不携带已提交视图的生命周期状态；L-Begin 是唯一离开该状态的规则，L-Unload 是唯一进入该状态的规则；其他每一行都将其前提中的 $\omega$ 原样带入结论。

（1）$\operatorname{edit}^t$ 不写入任何表，因为第五列没有列出任何表；$\Psi^t$ 也不会写入任意一个当前存在且满足 $m\ne n$ 的纤程之 $\sigma_m$。因此，$\sigma_m$ 只能在 $m=n$ 时变化，并且只能在 $\Psi^t$ 内部变化。

（2）$\omega_n$ 是 $\theta_n$ 的组成部分；只有 $\operatorname{edit}^t$ 会写入它，而且只会写入该步骤所作用之纤程上的字段。因此，根据上述解读，$\omega_n$ 在 $n$ 的一次 L-Begin 处出现，在 $n$ 的一次 L-Unload 处消失。$n$ 的活动期是 $\operatorname{installed}_n$ 始终成立的区间，因而 $\omega_n$ 在整个区间内都有定义；所以，这两条规则都不会落在该区间的内部。

（3）查看第四列可知，累加器只出现在 L-Unload 处：其他规则采用前向映射 $\operatorname{pr}_1\circ i$ 或 $\operatorname{id}_\Gamma$，而任何 $\operatorname{edit}^t$ 都不会把映射应用于状态。

（4）$\operatorname{installed}_n$ 即 $\theta_n\ne\mathsf{Inactive}(-)$。根据上述解读，只有 L-Begin 和 L-Unload 的前提与结论会在 $\theta_n$ 是否为 $\mathsf{Inactive}$ 这一点上有所不同。作用于某个 $m\ne n$ 的步骤不会写入 $\theta_n$；一次注册所添加的条目，其名称在 $\gamma^t$ 中尚不存在。

（5）第五列没有任何一行列出 $\pi$、$d$、$p$ 或 $e$；这些字段与 O-Insert 添加的条目同时出现，并由其结论写入；一次注册所执行的 O-Insert 也是如此。只有 O-Retire 会将 $\tau$ 写为 $\top$，无论它是由编排器执行，还是作为一次注册的逆操作执行（定义 47）。O-Insert 会在一个此前不存在的名称处设置 $\tau=\bot$，因此，没有任何步骤会把一个 $\tau$ 恢复为 $\bot$。$\square$

接下来的三项查阅说明了规则看不见什么。第一项是：规则仅通过上述观察来读取状态，因此，整个演算都可下降到 $\Gamma/{\simeq}$。

**引理 55（$\simeq$-不变性）。** 按照上文的方式解读，设 $\gamma\simeq\gamma'$。那么，第 4.3 节的一条规则在 $\gamma$ 处作用于 $n$，当且仅当它在 $\gamma'$ 处作用于 $n$；两次应用所到达的状态仍由 $\simeq$ 关联。

**证明。** 第 4.3 节的每项前提都属于四类之一，并且每一类读取的组成部分都会被该关系保留。将 $\theta_n$ 或 $\tau_n$ 与模式匹配的前提，以及 O-Remove 的前提 $\forall m.\ \pi_m\ne n$，读取控制字段。O-Insert 的前提 $(d,p,e)\in\mathfrak{C}_\Gamma$ 与 $\forall m.\ p\cap p_m=\varnothing$ 读取 $d$、$p$ 和 $e$。提及 $\operatorname{target}_n$ 或 $\operatorname{relied}_n$ 的前提读取 $\tau_n$、各个 $\theta_m$ 内的已提交视图，以及 $\operatorname{dom}(\sigma_\gamma)$；定义 45 从这些 $\theta_m$ 和 $\operatorname{dom}(\sigma_m)$ 计算出该定义域，而定义 33 只会在两个余效上下文的定义域相同时，才用关系将它们关联起来。其余前提读取 $\operatorname{dom}(F_\gamma)$。没有任何前提会在超出 $\simeq_k$ 的精度上读取某个值 $\sigma_\gamma(k)$，因此，没有任何前提能够区分两个由 $\simeq$ 关联的状态。

对于结论，根据定义 53，有 $\gamma^{t+1}=\operatorname{edit}^t(\Psi^t(\gamma^t))$。$\operatorname{edit}^t$ 所赋的值，是它所匹配前提的组成部分；根据上一段以及定义 51，这些值在两个状态处由相应关系关联，其中定义 51 会关联迭代器在两个 $\simeq$ 相关状态上产生的三元组。此外，$\Psi^t$ 保持 $\simeq$：它要么是 $\operatorname{id}_\Gamma$，要么是 $e_n$ 的一次迭代——定义 51 要求该迭代保持 $\simeq$——要么是 $\theta_n$ 内的累加器；根据同一定义，该累加器是若干个均保持 $\simeq$ 的逆函数之复合。$\square$

状态所携带的名称由上述观察中的两项读取，即 $\operatorname{dom}(F_\gamma)$ 以及控制字段的索引；而抽取名称的规则会抽取任意一个尚未使用的名称（定义 47）。因此，在 $\simeq$ 意义下解读下文结果时，还必须将它们理解到重命名为止；这正是第 4.1 节的约定在此处的具体兑现。

**引理 56（等变性）。** 设 $\chi:\mathfrak{N}\to\mathfrak{N}$ 是一个双射，并令 $\chi\mathbin{\cdot}\gamma$ 表示携带注册表 $F_\gamma\circ\chi^{-1}$ 的状态，其中，每个出现在 $\pi_m$ 或 $\omega_m$ 中的名称均被替换为其像。那么，$\chi\mathbin{\cdot}\gamma$ 是一个状态；当 $\gamma$ 良构时，它也良构；并且，$\operatorname{step}^t=r(n)$ 将 $\gamma^t$ 带到 $\gamma^{t+1}$，当且仅当 $r(\chi(n))$ 将 $\chi\mathbin{\cdot}\gamma^t$ 带到 $\chi\mathbin{\cdot}\gamma^{t+1}$。

**证明。** 前提读取名称时，只会将一个名称与另一个名称进行比较：要么直接比较，如 O-Insert 的新鲜性条件 $n\notin\operatorname{dom}(F_\gamma)$ 和 O-Remove 的 $\forall m.\ \pi_m\ne n$；要么通过名称表比较，如 $\operatorname{target}_n$ 和 $\operatorname{relied}_n$ 对 $\pi_m$ 与 $\omega_m$ 的读取。双射会保持每一项此类比较。规则所写入的名称只有 O-Insert 设置的 $\pi$ 和 L-Begin 设置的 $\omega$，二者都取自其前提所读取的内容，因此，这些写入与 $\chi$ 可交换。效应函数根本不写入名称，只会通过定义 47 的原语抽取名称；定义 48 将该抽取的影响限制在该原语所添加的条目中。良构性（定义 58）则由四项名称之间的比较条件组成。$\square$

因此，一个序列及其重命名会按相同顺序采用相同规则，并到达仅相差 $\chi$ 的状态。相应地，若两个序列除其注册所抽取的名称之外均一致，就将二者视为同一序列；下文结果也都理解到能够将它们等同起来的重命名为止。

第二项查阅是：一个除名称之外已被剥去所有内容的条目，对于规则而言不可见。正是这一点，使定义 47 能够在其恢复所得的状态不含某个纤程时退役该纤程，也使引理 72 能够移除被删除活动期所创建的注册。

**引理 57（残留条目）。** 若在 $\gamma$ 处有 $\tau_n=\top$、$\theta_n=\mathsf{Inactive}(\bot)$、$\sigma_n=\varnothing$，并且不存在满足 $\pi_m=n$ 的 $m$，则称 $n$ 在 $\gamma$ 处是残留的；一个残留条目满足 $\gamma\approx\gamma\setminus n$。若 $n$ 在 $\gamma$ 处是残留的，则对于每条规则以及每个 $m\ne n$：

1. 若一条规则可在 $\gamma$ 处作用于 $m$，则它也可在 $\gamma\setminus n$ 处作用于 $m$；两次应用到达的状态仅在 $n$ 的条目上有差异，并且该条目仍是残留的。

2. 反过来，若一条规则可在 $\gamma\setminus n$ 处作用于 $m$，则它也可在 $\gamma$ 处作用于 $m$；但抽取名称 $n$ 或声明 $p_n$ 中某个键的 O-Insert 除外。

**证明。** 对一条作用于 $m\ne n$ 的规则而言，残留的 $n$ 不会对其前提所读取的任何观察作出贡献。它并非 $\mathsf{Active}$，所以 $\sigma_n$ 不会进入 $\sigma_\gamma$，并且 $n$ 不是任何键的提供者；因此，$\gamma\vDash d_m$ 和 $\operatorname{target}_m$ 均不受影响。$\operatorname{installed}_n$ 不成立，所以 $n$ 不会为 $\operatorname{relied}_m$ 的任何析取项作出贡献。没有 $\pi_{m'}$ 指向 $n$，所以在对 $m$ 执行 O-Remove 时，其前提 $\forall m'.\ \pi_{m'}\ne m$ 不受影响。$\theta_n$、$\tau_n$ 和 $\pi_n$ 则只会被作用于 $n$ 的规则读取。条款 (2) 排除的两项前提，正是移除该条目后被放宽的两项：不存在的名称是新鲜的，而不存在的供给与其他每项供给都相容。根据引理 54，作用于 $m\ne n$ 的规则不会写入 $n$ 的任何字段，故该条目会保留下来；根据定义 48，该步骤的状态映射局限于 $m$，故仍会使 $\sigma_n$ 为空。$\square$

简化生命周期状态，并一并简化那些在其上进行匹配的规则，会得到一个子演算；并非每项结果都能在这种简化下保留下来。删除第 4.3.1 节是关键情形；从元理论一侧来看，这正是第 4.3 节开头所作的划分：该节的守卫建立了定义 58 的条款 (3) 和 (4)，而定理 63 又依赖于该守卫所创建的区间，因此，一旦没有该节，这三者都不成立。其他三个小节所加入的内容则可被简化掉，而不影响下文结果；它们中的每一个都只是在定义 49 所确定的同一个状态空间上添加规则。

#### 4.4.1. 保持性

定义 45 确定了注册表的形状；在下文结果能够为其增添性质之前，必须先依据该形状检查这些规则。本小节指出规则所保持的不变量，其中第一项条款就是该形状，其余条款则是后续结果所采用的假设。

**定义 58.** 若对于所有 $m,n\in\operatorname{dom}(F_\gamma)$ 以及所有 $k\in K$，下列条件均成立，则注册表 $F_\gamma$ 是良构的：

1. $\pi_n\in\operatorname{dom}(F_\gamma)\cup\{\mathsf{root}\}$；

2. $m\ne n\Rightarrow p_m\cap p_n=\varnothing$；

3. $\operatorname{installed}_n(\gamma)\Rightarrow\omega_n$ 在 $d_n$ 上是全函数，且取值均属于 $\operatorname{dom}(F_\gamma)$；

4. $\operatorname{installed}_n(\gamma)\land k\in d_n\land\omega_n(k)=m\Rightarrow\operatorname{installed}_m(\gamma)$。

条款 (1) 将定义 45 的树逐边读出，确保父指针落在注册表中。该定义还要求无环性，但这里不需要为此另设条款，因为指针所指名的纤程总是先于持有该指针、因而指名它的纤程完成注册。

**定理 59（保持性）。** 若 $F^t$ 良构，那么，无论步骤 $t$ 应用哪一条规则，$F^{t+1}$ 都是良构的。在 $\gamma^{t+1}$ 处，每一项条款都由 $\gamma^t$ 处的全部四项条款共同建立。

**证明。** 设 $\operatorname{step}^t$ 作用于 $n$。

（1）根据表 1，只有 O-Insert 和 O-Remove 会写入 $\pi$ 或 $\operatorname{dom}(F_\gamma)$。O-Insert 以 $\pi_n\in\operatorname{dom}(F^t)\cup\{\mathsf{root}\}$ 为前提；这就是它所添加纤程需要满足的条款。它在扩大 $\operatorname{dom}(F_\gamma)$ 的同时，不会改动其他任何 $\pi$。O-Remove 以 $\forall m.\ \pi_m\ne n$ 为前提，因此，没有任何保留下来的 $\pi_m$ 会指向它所移除的纤程。

（2）O-Insert 的最后一项前提是 $\forall m.\ p_n\cap p_m=\varnothing$；这就是它所添加纤程需要满足的条款。根据表 1，没有其他规则会写入 $p$ 或扩大 $\operatorname{dom}(F_\gamma)$。下文将使用由此得到的两项推论：根据定义 43，$\operatorname{dom}(\sigma_m)\subseteq p_m$，所以不同的表彼此不相交，$\sigma_\gamma$ 因而是一个函数；此外，$k\in p_m\cap p_{m'}$ 会迫使 $m=m'$，所以 $k$ 至多有一个可能的提供者。

（3）根据引理 54(2)，唯一会写入 $\omega_n$ 的规则是 L-Begin。它的前提 $\omega=\operatorname{target}_n^t\ne\bot$ 使 $\omega$ 在 $d_n$ 上为全函数，且取值属于 $\operatorname{dom}(F^t)$，因为 $\operatorname{target}$ 所指名的正是提供者。根据表 1，唯一会缩小 $\operatorname{dom}(F_\gamma)$ 的规则是 O-Remove；其前提 $\theta_n^t=\mathsf{Inactive}(-)$ 给出 $\neg\operatorname{installed}_n^t$。于是，根据 $\gamma^t$ 处的条款 (4)，对于任何已安装的 $m$，都不存在满足 $k\in d_m$ 且 $\omega_m^t(k)=n$ 的情形；而 $n$ 本身不携带 $\omega$。

（4）根据引理 54(2) 和 (4)，该条款只可能在下列情形下于 $\gamma^{t+1}$ 处失效：某个纤程从已安装变为未安装；某个 $\omega$ 被写入；或某个被 $\omega$ 指名的纤程离开 $\operatorname{dom}(F_\gamma)$。最后一种情形是 O-Remove；被移除的纤程并未安装，因此，根据 $\gamma^t$ 处的条款 (4)，任何已安装 $m$ 的 $\omega_m^t$ 都不会指名它。第一种情形是对 $n$ 执行 L-Unload，其前提 $\neg\operatorname{relied}_n^t$ 表示

$$
\forall m\ne n,\ k\in d_m.\quad
\operatorname{installed}_m^t
\Rightarrow
\omega_m^t(k)\ne n.
$$

该规则不会写入任意 $m\ne n$ 的 $\omega_m$，并且会使 $\neg\operatorname{installed}_n^{t+1}$ 成立，所以该条款对 $n$ 本身也成立。第二种情形是对 $n$ 执行 L-Begin，它写入 $\operatorname{target}_n^t$；该映射的值是 $d_n$ 中各个键的提供者，因而这些提供者在 $\gamma^t$ 处均为 $\mathsf{Active}$。该步骤不改变其他任何纤程的 $\theta$，所以它们在 $\gamma^{t+1}$ 处也已安装。$\square$

L-Unload 上的守卫正是条款 (3) 和 (4) 得以成立的原因。O-Remove 的前提 $\forall m.\ \pi_m\ne n$ 只涉及父指针；真正阻止已提交视图指向一个已移除纤程的，是在此前若干步骤处、出于另一个原因施加的该守卫。由于失败同样经由 $\mathsf{Unloading}$ 安排路径，所以无须针对错误结果重复这一论证。由此还会得到基础演算并不具备的两项性质。其一，由 O-Remove 释放的名称可以由 O-Insert 再次发放，因为不会有过时的已提交视图指向它；其二，一旦纤程成为 $\mathsf{Inactive}$，就可以立即将其移除，而无须另行检查是否没有任何对象依赖它。

#### 4.4.2. 时间可组合性

局部时间可组合性使用一个累加器恢复一个效应序列（第 3.1.3 节）。注册表为每个纤程保存一个累加器，而各纤程会彼此交错执行：从 $n$ 将一个逆函数复合到 $g_n$ 上，到 $g_n$ 实际运行之间，其他纤程已经改变了状态。全局形式的保证所断言的是：$g_n$ 在这个新的位置是否仍会撤销当初构造它时要撤销的内容；该保证赖以成立的条件是，中间插入的步骤与 $g_n$ 可交换。

**定义 60.** 对于 $i\in\mathfrak{E}^{\mathrm{iter}*}_\Gamma$，令 $\operatorname{reach}(i)$ 表示包含 $i$ 且在续延下封闭的最小迭代器集合。将定义 17 的变换幺半群 $\mathfrak{M}$ 解读到迭代器上时，以 $\operatorname{reach}(i)$ 中每个迭代器的前向映射和它所产生的逆函数作为生成元：

$$
\begin{aligned}
\operatorname{reach}(i)
&\coloneqq
\bigcap\Bigl\{S \Bigm|
i\in S
\land
\forall i'\in S,\ \gamma\in\Gamma.\;
i'(\gamma)=(-,-,\mathsf{Just}(i''))
\Rightarrow i''\in S
\Bigr\},\\[4pt]
\mathfrak{M}(i)
&\coloneqq
\left\langle
\{\operatorname{pr}_1\circ i' \mid i'\in\operatorname{reach}(i)\}
\cup
\{\operatorname{pr}_2(i'(\gamma)) \mid i'\in\operatorname{reach}(i),\ \gamma\in\Gamma\}
\right\rangle.
\end{aligned}
\tag{54}
$$

在第 4.3.4 节适用之处，应将三元组理解为包裹在 $\mathsf{Right}$ 中。记 $\operatorname{len}(i)$ 为所有链 $C\subseteq\operatorname{reach}(i)$ 的 $|C|$ 之上确界，其中这些链由续延关系排序。若两个迭代器 $i,j$ 在定义 19 的意义下独立，则称它们独立；这里使用上述变换幺半群来解读该定义，并把一次迭代的产出解读为其逆函数与续延：

$$
\begin{aligned}
&\forall f\in\mathfrak{M}(i),\ g\in\mathfrak{M}(j).\quad
f\circ g \simeq g\circ f,\\[4pt]
&\forall i'\in\operatorname{reach}(i),\ g\in\mathfrak{M}(j),\ \gamma\in\Gamma.\quad
\operatorname{pr}_{2,3}(i'(g(\gamma)))
\simeq
\operatorname{pr}_{2,3}(i'(\gamma)),
\end{aligned}
\tag{55}
$$

并且还要对 $j$ 对称地满足上述条件。映射上的 $\simeq$ 按定义 36 解读，续延上的 $\simeq$ 按定义 51 解读，而注册型迭代（定义 47）上的 $\simeq$ 则解读为它所指名的组件一致。当对于每个 $l\ne l'$，$i_l$ 与 $i_{l'}$ 均独立时，称迭代器族 $(i_l)_{l\in L}$ 两两独立。当 $(e_n)_{n\in N}$ 两两独立时，称一个步骤序列两两独立；其中，$N$ 是该序列曾经持有的全部名称所组成的集合，编排器插入的每个纤程以及某次迭代注册的每个纤程各对应其中一个名称。

这种意义下的独立性，正是迹理论作为原语采用的概念：可交换动作会在序列上生成一个等价关系，在该关系下，交换两个相邻且独立的动作仍会保持终点不变 [44]；引理 71 针对这些规则给出的，正是这样的交换。这里采用族而非集合，是为了将同一组件的两个名称都保留在考察范围内：此时，该条件要求该组件的效应函数与自身独立，亦即要求 $\mathfrak{M}(i)$ 可交换。定理 61 使用第一项条件，定理 73 还需要第二项条件：重新排列两个纤程的步骤，会使其中一个迭代器在另一个纤程改变过的状态上求值；仅仅让映射可交换，并不能说明该迭代器会在那里产生相同的逆函数和相同的续延。检查第一项条件只需考察这些迭代本身，因为引理 18(1) 会将可交换性从生成元传递到它们所生成的幺半群。

在这些条件下，定理 7 的单累加器不变量能够在交错执行中继续成立，并呈现为赋予时间可组合性实际内容的如下形式：运行一个逆函数，只会撤回该纤程的贡献，而不会撤回其他任何内容。

**定理 61（恢复精确性）。** 设步骤序列两两独立，$n$ 的一个活动期在 $b$ 处开启，$u\ge b$ 位于该活动期内；再令 $t_1<\cdots<t_l$ 为区间 $[b,u)$ 内所有作用纤程并非 $n$ 的步骤索引。则

$$
g_n^u(\gamma^u)
\approx
(\Psi^{t_l}\circ\cdots\circ\Psi^{t_1})(\gamma^b).
\tag{56}
$$

也就是说，在 $\gamma^u$ 处应用 $n$ 的累加器，所得到的状态在忽略控制字段后，等于从 $\gamma^b$ 开始执行这些相同步骤本会产生的状态。若要把右侧理解为 $n$ 从未开始时所到达的状态，还须额外假设 $n$ 所注册的纤程均未在 $[b,u)$ 内执行步骤，因为由 $n$ 注册的纤程在 $n$ 从未开始的情形下根本不会存在，也就不可能执行这些步骤。

**证明。** 对 $u$ 作归纳，考察所有满足 $u+1$ 仍位于该活动期内的索引 $u$。当 $u=b$ 时，根据定义 53，该活动期的开启表明 $b-1$ 处的步骤为 L-Begin；所以根据表 1，$g_n^b=\operatorname{id}_\Gamma$，索引集为空，命题即 $\gamma^b\approx\gamma^b$。每个归纳步骤都会用到两项事实。由于 $\operatorname{edit}^t$ 只写入控制字段，

$$
\gamma^{t+1}\approx\Psi^t(\gamma^t).
$$

此外，根据定义 48 与定义 47，$\mathfrak{M}(e_n)$ 中的每个映射都不写入控制字段，唯有注册所添加的控制字段除外；因此，每个此类映射都会把 $\approx$-相等的状态映射为 $\approx$-相等的状态。

设 $\operatorname{step}^u$ 作用于 $n$。由于该活动期在 $u$ 和 $u+1$ 处都处于开启状态，引理 54(4) 排除了 $n$ 的 L-Begin 与 L-Unload；而 O-Insert 与 O-Remove 对 $\theta_n$ 的要求又被 $\operatorname{installed}_n^u$ 排除，故只剩下两种情形。当规则为 L-Iter、L-Finish 或迭代落定的 L-Divert 时，表 1 给出 $\Psi^u=\operatorname{pr}_1\circ i_n^u$，并且对于该次迭代所产生的逆函数 $h$，有 $g_n^{u+1}=g_n^u\circ h$。定义 51 的见证条件给出 $h(\Psi^u(\gamma^u))=\gamma^u$；若该迭代注册了一个纤程，则该等式按引理 57 理解到 $\approx$ 为止。根据上式，$g_n^u$ 保持 $\approx$，所以

$$
g_n^{u+1}(\gamma^{u+1})
\approx
(g_n^u\circ h)(\Psi^u(\gamma^u))
=
g_n^u(\gamma^u).
$$

当规则为 L-Leave、L-Raise、中止迭代的 L-Divert，或 $n$ 的 O-Retire 时，表 1 给出 $\Psi^u=\operatorname{id}_\Gamma$ 和 $g_n^{u+1}=g_n^u$，因此令 $h=\operatorname{id}_\Gamma$，同一个等式仍然成立。无论属于哪种情形，归纳假设都会在索引集不变的情况下继续成立；这正是逐步执行定理 7 的计算。

设 $\operatorname{step}^u$ 作用于 $m\ne n$。根据表 1，$g_n^{u+1}=g_n^u$；并且 $\Psi^u\in\mathfrak{M}(e_m)$，若该规则是编排规则，则 $\Psi^u=\operatorname{id}_\Gamma$。因此，独立性给出

$$
g_n^u(\gamma^{u+1})
\approx
g_n^u(\Psi^u(\gamma^u))
=
\Psi^u(g_n^u(\gamma^u)),
$$

这就是在归纳假设后追加 $\Psi^u$。$\square$

**推论 62（终态恢复）。** 设步骤序列两两独立，并设 $n$ 的一个活动期在 $b$ 处开启、在 $u$ 处闭合，无论 $n$ 最终到达何种结果。令 $t_1<\cdots<t_l$ 与定理 61 中相同，则

$$
\gamma^{u+1}
\approx
(\Psi^{t_l}\circ\cdots\circ\Psi^{t_1})(\gamma^b).
\tag{57}
$$

由 O-Remove 移除的纤程同样不会留下任何内容，因为其前提只允许 $\theta_n=\mathsf{Inactive}(-)$。

**证明。** 根据引理 54(4)，$\operatorname{step}^u$ 是对 $n$ 执行的 L-Unload；根据引理 54(3)，其 $\Psi^u$ 为 $g_n^u$。因此，$\gamma^{u+1}\approx g_n^u(\gamma^u)$，定理 61 随即适用。该陈述与 $\approx$ 都不涉及 $\zeta$；根据表 1，L-Divert 与 L-Raise 所通向的状态恰好只在这个字段上有所不同。$\square$

上述结果把两两独立性作为组件所满足的假设，而第 3.3.2 节正是用来解除这一假设的：当组件执行的每项效应都是某个键上的操作，并且每个键都可交换时，由这些操作构建的任意两个效应函数都是独立的（定理 42）。将该结果从效应函数传递到迭代器并不需要任何新条件：由余效介导的效应函数（定义 41）已经依据每个阶段所产生的结果来选择其后内容，而这正是迭代器在其续延中携带的内容。第 3.2 节的余效操作则是完全不需要假设的情形：组件在那里贡献的映射，是集合操作与相应限制操作的复合；只要两项操作涉及的键互不相交，它们就可交换，而定义 58 的条款 (2) 保证了不同纤程的供给彼此不相交。

#### 4.4.3. 空间可组合性

局部空间可组合性要求组件遵守自身规约：只有在其依赖均已得到提供时才激活组件，并依据这些依赖对上下文的每次变化进行分类（第 3.2.2 节）。全局形式则加入了需要量化其他纤程的内容：提供者只有在所有曾将某项绑定解析到它的依赖方都已停用之后，才会撤回该绑定；而某次迁移安装其效应时所依据的解析，也不会在迁移执行期间从其下方发生偏移。余效一侧的两项性质分别给出这两项保证；二者将被一并证明，因为它们是同一个不变量的两个方面，即引理 54(2) 所建立的 $\omega_n$ 在一个活动期内保持固定。顺序性定理说明，这种固定性在活动期中 $n$ 先处于 $\mathsf{Active}$、继而处于 $\mathsf{Unloading}$ 的部分上带来了什么；相干性定理则说明，它在 $n$ 正在安装其效应的部分上带来了什么。

**定理 63（顺序性）。** 纤程只会在其依赖均已得到提供时开始迁移：

$$
\operatorname{step}^t=\text{L-Begin}(m)
\quad\Longrightarrow\quad
\gamma^t\vDash d_m.
\tag{58}
$$

进一步设 $[b',u']$ 是 $m$ 的一个活动期，并且对于某个 $m\ne n$ 和 $k\in d_m$，有 $\omega_m^{b'}(k)=n$；设 $[b,u]$ 是包含 $b'$ 的 $n$ 的活动期，并令 $t$ 遍历 $[b',u']$。则：

1. $\omega_m^t(k)=n$；
2. $b<b'$；并且，如果 $[b,u]$ 闭合，则 $u'<u$；
3. $k\in\operatorname{dom}(\sigma_n^t)$，且 $\sigma_n^t(k)=\sigma_n^{b'}(k)$。

**证明。** 第一个断言就是 L-Begin 的前提 $\operatorname{target}_m^t\ne\bot$；根据定义 46，该前提给出 $\gamma^t\vDash d_m$。

(1) 即引理 54(2)。

对于 (2)，$b'-1$ 处的 L-Begin 写入 $\omega_m^{b'}=\operatorname{target}_m^{b'-1}$，其值均为提供者，因此 $\theta_n^{b'}=\mathsf{Active}(-,-)$；而 $b-1$ 处的 L-Begin 使 $\theta_n^b=\mathsf{Reloading}(-,-,-)$，所以 $b\ne b'$，进而 $b<b'$；根据定义 53，这两个活动期都在相应位置开启。设 $[b,u]$ 闭合，并假设 $u\le u'$。于是 $u\in[b',u']$，故 $\operatorname{installed}_m^u$ 成立；再由 (1)，$\omega_m^u(k)=n$。这意味着 $\operatorname{relied}_n^u$，但 $u$ 处的 L-Unload 否定了这一点。因此 $u'<u$。

对于 (3)，在 $\gamma^{b'}$ 处，$n$ 是 $k$ 的提供者，所以 $k\in\operatorname{dom}(\sigma_n^{b'})$。$n$ 的 L-Unload 不会落在 $[b',u']$ 内：若 $[b,u]$ 闭合，则由 (2)，该步骤位于 $u>u'$；若它不闭合，则由引理 54(4)，$n$ 根本不存在 L-Unload。又因为 $\theta_n^{b'}=\mathsf{Active}(-,-)$，表 1 因而表明，在 $[b',u']$ 内，能够作用于 $n$ 的规则只有 L-Leave，而它的 $\Psi^t$ 为 $\operatorname{id}_\Gamma$；根据引理 54(1)，$\sigma_n$ 在该区间内保持不变。$\square$

否则，一次分布在多个步骤上的迁移可能会安装基于某项解析计算出的效应，而这项解析在迁移执行期间已经发生变化；有两个前提阻止了这种情况。L-Iter 和 L-Finish 都带有 $\operatorname{target}_n(\gamma)=\omega$，因此，只有当迁移的已提交视图仍然是其目标视图时，迁移才会继续；L-Divert 则带有该条件的否定，所以目标视图一旦改变，纤程就会退出这次迁移。L-Raise 完全不以目标视图为条件，因为抛出错误是迭代自身所做的事情，而不是环境所请求的事情；无论如何，它都会退出这次迁移。这两种变化方向并不加以区分：依赖已经消失的组件与依赖已被替换的组件都经由同一条路径离开，因为变为 $\bot$ 的目标视图与变为另一个纤程的目标视图，都同样不等于 $\omega$。

惯性使得上述性质无法成为关于每个步骤的保证。当目标视图发生变化时，一次已经在执行途中的迭代仍会依据 L-Divert 落定，而这次落定会安装基于某项已经不再成立的解析计算出的效应。因此，这些规则提供的是一个析取；正是第二个分支使第一个分支保持安全。

**定理 64（解析相干性）。** 设 $n$ 的一个活动期 $[b,u]$ 在 $b$ 处开启，且 $\omega_n^b=\omega$。那么，$\theta_n$ 在该活动期的某个初始区间 $[b,r]$ 上为 $\mathsf{Reloading}(-,-,-)$，并且这次迁移的每次迭代都针对同一项解析 $\omega$ 运行：

$$
\forall t\in[b,r].\quad
\operatorname{step}^t\in
\{\text{L-Iter}(n),\text{L-Finish}(n)\}
\Longrightarrow
\operatorname{target}_n^t=\omega.
\tag{59}
$$

当纤程离开该区间，即 $r<u$ 时，下列两种情形恰有一种成立：

1. $\operatorname{step}^r=\text{L-Finish}(n)$，且 $\theta_n^{r+1}=\mathsf{Active}(-,\omega)$；
2. $\operatorname{step}^r\in\{\text{L-Divert}(n),\text{L-Raise}(n)\}$，并且该活动期在某个 $u>r$ 处闭合；与推论 62 相同，此时 $\gamma^{u+1}\approx(\Psi^{t_l}\circ\cdots\circ\Psi^{t_1})(\gamma^b)$。

**证明。** $b-1$ 处的 L-Begin 写入 $\mathsf{Reloading}$；根据表 1，它是唯一会进入这一生命周期状态的规则。其前提 $\theta_n=\mathsf{Inactive}(\bot)$ 与引理 54(4) 共同保证，对它的第二次应用只能发生在该活动期之外。因此，$\mathsf{Reloading}$ 占据 $[b,u]$ 的某个初始区间 $[b,r]$，并且不会被再次进入。第一个断言于是来自表 1 为 L-Iter 和 L-Finish 给出的前提 $\operatorname{target}_n(\gamma)=\omega'$，再结合引理 54(2) 所给出的 $\omega'=\omega$。

对于上述二分情形，$\operatorname{step}^r$ 的前提必须含有 $\theta_n=\mathsf{Reloading}(-,-,-)$，而其结论不再处于该状态；表 1 给出的候选只有 L-Finish、L-Divert 和 L-Raise。第一条规则落入 $\mathsf{Active}(-,\omega)$，后两条则落入 $\mathsf{Unloading}(-,\omega,-)$；根据引理 54(4)，从后一状态离开的唯一方式是 L-Unload，而推论 62 给出了相应等式。迭代落定型 L-Divert 所贡献的迭代属于 $n$ 自身，因此也属于该累加器随后撤回的映射。若反而有 $r=u$，则该序列结束时迁移仍在进行中，此时只断言第一个结论。$\square$

#### 4.4.4. 进展性

只有当一个将提供者撤回推迟到其依赖方全部离开之后的守卫最终会被释放时，它才能给出定理 63。注册表纤程上的一个关系承载了这一论证。

**定义 65.** 注册表各名称上的优先关系定义为

$$
n\prec m\ \coloneqq\ p_n\cap d_m\ne\varnothing,
\tag{60}
$$

也就是说，$n$ 可能提供 $m$ 所声明的某个键。该关系只读取 $d$ 和 $p$；根据引理 54(5)，二者随纤程条目的加入而出现，此后再也不会被写入。

定理 66 和定理 73 都建立在 $\prec$ 无环这一假设之上；这是一项假设，而不是该定义自动给出的性质，因为对于一个声明了自身所提供之键的组件，会有 $n\prec n$。$\prec$ 排序的是两个纤程的激活，而不是它们的生存期：$n\prec m$ 表示 $n$ 必须先于 $m$ 成为 $\mathsf{Active}$；至于提供者比其使用者存活得更久，则是定理 63(2)——它是关于带守卫演算的一条定理。

纤程的目标视图既取决于其提供者，也取决于创建该纤程的纤程。创建者通过定义 47 的原语写入 $\tau_n$，而根据引理 54(5)，$\tau$ 是单调的。因此，在一个子纤程的整个存在期间，其创建者至多能使该子纤程的目标视图发生一次变化。

进展性断言的是存在某条可以应用的规则，因此，它是针对宿主必须提供的规则来表述的：L-Begin、L-Leave、L-Unload，迭代落定规则 L-Iter、L-Finish 和 L-Raise，以及 L-Divert。其论证从不诉诸 L-Divert 的中止型分支，所以，受第 4.3.3 节惯性约束的宿主同样包含在内。

**定理 66（进展性）。** 假设 $\prec$ 无环，对每个 $n$ 均有 $\operatorname{len}(e_n)\le K$，并且定义 60 的名称集合 $N$ 有限；再设每一步都应用一条生命周期规则。记 $S(n)$ 为作用于 $n$ 的步骤数，并记

$$
V(n)\coloneqq
\left|\left\{t:\operatorname{target}_n^t
\ne\operatorname{target}_n^{t+1}\right\}\right|
\tag{61}
$$

为其目标视图发生变化的次数。则：

1. **（无死锁。）** $\neg\operatorname{quiet}^t$ 蕴含在 $\gamma^t$ 处有某条生命周期规则可以应用；
2. **（终止性。）** $S(n)\le(K+4)(V(n)+1)$，并且 $V(n)$ 与 $\sum_n S(n)$ 都是有限的。

因此，每个极大的生命周期步骤序列都终止于静止状态。

**证明。** **无死锁。** 设 $\neg\operatorname{quiet}^t$，于是存在某个纤程 $n$，它不满足定义 49 中静止条件的任何一个条款。对照表 1 阅读它可能处于的四类状态，可得：

- $\theta_n^t=\mathsf{Inactive}(\bot)$ 且 $\operatorname{target}_n^t\ne\bot$：L-Begin 可以应用；

- $\theta_n^t=\mathsf{Reloading}(-,-,\omega_n)$ 且 $\operatorname{target}_n^t=\omega_n$：由 $i_n^t(\gamma^t)$ 的值所选出的 L-Iter、L-Finish 或 L-Raise 可以应用；

- $\theta_n^t=\mathsf{Reloading}(-,-,\omega_n)$ 且 $\operatorname{target}_n^t\ne\omega_n$：若 $i_n^t(\gamma^t)$ 抛出错误，则 L-Raise 可以应用；否则 L-Divert 可以应用，并让该次迭代落定而不是将其中止；

- $\theta_n^t=\mathsf{Active}(-,\omega_n)$ 且 $\operatorname{target}_n^t\ne\omega_n$：L-Leave 可以应用。

假设没有任何纤程属于上述任何一类，则还剩下某个满足 $\theta_{m_0}^t=\mathsf{Unloading}(-,-,-)$ 的 $m_0$。如下构造 $m_0,m_1,\ldots$：给定处于 $\mathsf{Unloading}$ 的 $m_j$，若 $\neg\operatorname{relied}_{m_j}^t$，则 L-Unload 可以应用于 $m_j$，构造终止；否则，存在 $m_{j+1}\ne m_j$ 和 $k_j$，使得 $\operatorname{installed}_{m_{j+1}}^t$ 且 $\omega_{m_{j+1}}^t(k_j)=m_j$。在后一种情形下，

$$
k_j\in
d_{m_{j+1}}\cap\operatorname{dom}(\sigma_{m_j}^t)
\subseteq
d_{m_{j+1}}\cap p_{m_j}.
$$

第二个成员关系来自定理 63(3)：$t$ 位于 $m_{j+1}$ 的某个活动期中。因此，$m_j\prec m_{j+1}$。此外，$\operatorname{target}_{m_{j+1}}^t\ne\omega_{m_{j+1}}^t$：处于 $\mathsf{Unloading}$ 的纤程不属于定义 $\sigma_\gamma$ 时所取的并集，所以在 $\gamma^t$ 处，$k_j$ 要么未被提供，要么由 $m_j$ 之外的纤程提供。若 $m_{j+1}$ 处于 $\mathsf{Active}$ 或 $\mathsf{Reloading}$，它就会属于上文已经排除的四类之一，所以它处于 $\mathsf{Unloading}$，构造可以继续。$m_j$ 按 $\prec$ 严格递增，因而由无环性可知它们彼此不同；又因为 $\operatorname{dom}(F^t)$ 有限，所以构造必然终止。

**终止性。** 用以下两个断言界定 $S(n)$。

**(A)** 在 $\operatorname{target}_n^t$ 恒为 $\omega^*$ 的任意极大区间上，至多有 $K+4$ 个步骤作用于 $n$。沿表 1 中的 $\theta_n$ 各列来看，若纤程从满足 $\omega\ne\omega^*$ 的 $\mathsf{Active}(-,\omega)$ 出发，它依次执行一次 L-Leave 和一次 L-Unload；然后，若 $\omega^*\ne\bot$，再执行一次 L-Begin 和至多 $\operatorname{len}(e_n)\le K$ 次迭代落定，并且当最后一次落定为 L-Raise 时，还会再执行一次 L-Unload。若从针对某个 $\omega\ne\omega^*$ 的 $\mathsf{Reloading}$ 出发，则以 L-Divert 代替 L-Leave；若从其他任何状态出发，则执行上述序列的某个后缀。该区间内不会再出现 L-Divert 或 L-Leave，因为 L-Begin 写入的 $\omega$ 正是 $\operatorname{target}_n^t=\omega^*$ 本身；而在 $\mathsf{Active}(-,\omega^*)$、目标为 $\omega^*=\bot$ 时的 $\mathsf{Inactive}(\bot)$，以及 $\mathsf{Inactive}(\xi)$ 处，根本没有任何规则可以应用。

**(B)** 若 $\operatorname{target}_n^t\ne\operatorname{target}_n^{t+1}$，且步骤 $t$ 作用于 $m$，则要么 $m\prec n$，要么步骤 $t$ 写入 $\tau_n$。根据定义 46，$\operatorname{target}_n$ 的值是 $\tau_n$ 与 $d_n$ 中各个键之提供者的表的函数；某个提供者满足 $k\in\operatorname{dom}(\sigma_m)\cap d_n$，因而有 $m\prec n$；根据引理 54(1)，一张表只会在作用于其自身纤程的步骤中发生变化。在第一种情形下，无环性给出 $m\ne n$；而在第二种情形下，引理 54(5) 的单调性使每个纤程至多允许一个这样的 $t$。

根据 (A)，按区间计数便得到

$$
S(n)\le(K+4)(V(n)+1).
$$

根据 (B)，$\operatorname{target}_n$ 的每次变化，要么耗用一个在 $\prec$ 下严格低于 $n$ 的纤程之步骤，要么就是 $\tau_n$ 所允许的那唯一一次变化，所以

$$
V(n)\le 1+\sum_{m\prec n}S(m).
$$

由于 $\prec$ 无环且 $N$ 有限，递归式

$$
B(n)\coloneqq
(K+4)\left(2+\sum_{m\prec n}B(m)\right)
$$

是良基的，并且定义出的 $B$ 满足 $S(n)\le B(n)$；所以 $V(n)$ 有限，且 $\sum_n S(n)\le\sum_n B(n)$。根据 (1)，无法再扩展的序列必然静止。$\square$

$N$ 的有限性是一个假设，而非推导所得；对组件施加一项条件即可保证它。宿主持有的组件，是在任何执行发生之前就给定的有限多个程序；因此，如果没有任何组件能够——无论直接还是间接——注册这样一种组件的纤程：后者又会注册自身的某个纤程，那么这些注册就会形成一棵深度有界的树，而 $\operatorname{len}(e_n)\le K$ 会界定其分支因子。该假设所排除的是这样一种组件：它会无界地注册自身的实例。

目标所记录的是提供纤程，而不是一个布尔值；在第 4.2 节的单一来源约束下，二者会驱动相同的迁移，因为在那里一个键只有一个可能的提供者。视图带来的益处，是为上述结果提供表达词汇：定理 63 与定理 64 都谈论纤程激活时所依据的解析；它也使这些结果在第 3.2.3 节的作用域解析下仍然成立，因为在这种解析下，同一个键会在不同隔离域中解析到不同提供者，供给本身不再能唯一确定视图。实现携带了这种作用域，并把该视图保存在 `fiber.committed` 中（第 5.1.3 节）。

#### 4.4.5. 合流性

迄今为止的结果都针对单个纤程。刻画整个系统的性质是：系统的动态历史不会留下任何痕迹。无论一个运行中的系统经历了怎样的激活与停用序列，它最终静止时所处的状态，都与下述过程产生的状态相同：采用相同的插入与退役操作，按照依赖顺序，将最终处于活动状态的每个组件各加载一次，并且不卸载任何组件。生命周期关系是合流的，而它所收敛到的正规形就是静态组装所得的正规形。对于动态组合而言，这对应于变化传播为增量计算所建立的性质：它与从头开始的求值保持一致 [45]。

该断言只涉及 $\longrightarrow$。编排步骤是输入；若给予两个序列不同的输入，它们自然会落在不同位置，这没有值得讨论之处。真正的问题是：生命周期规则在下一步选择哪个纤程方面具有非确定性，而且对于一个 $\mathsf{Reloading}$ 纤程选择哪一种退出方式也具有非确定性；这些规则是否可能因此产生彼此不一致的结果。

首先需要三个引理。第一个引理不借助任何步骤序列，便确定最终成为 $\mathsf{Active}$ 的纤程集合；正因如此，该集合才是输入而非调度的函数。

**定义 67.** 若一个纤程尚未退役、注册它的纤程受到支持，并且它所声明的每个键都由一个受到支持的纤程提供，则称该纤程在 $\gamma$ 处受到支持。$\operatorname{dom}(F_\gamma)$ 上的支持关系，是上述条款所读取的两个关系之并：

$$
m\mathrel{\vartriangleleft}n
\ \coloneqq\
m\prec n\ \lor\ \pi_n=m.
\tag{62}
$$

当该关系良基时（引理 68），记 $A$ 为支持集，即 $\gamma$ 处所有受到支持的纤程：

$$
n\in A
\ \coloneqq\
\neg\tau_n
\land(\pi_n=\mathsf{root}\lor\pi_n\in A)
\land
\forall k\in d_n.\ \exists m\in A.\ k\in p_m,
\tag{63}
$$

其中，$\pi_n=\mathsf{root}$ 表示该纤程由编排器插入；否则，$\pi_n$ 表示在激活期间注册 $n$ 的那个纤程。这些条款不读取 $\tau$、$\pi$、$d$ 和 $p$ 之外的任何字段。这两个关系分支都把一个纤程关联到紧邻其下方的一个纤程：一个是父级而非祖先，另一个是直接提供者而非传递提供者，因为这些正是相应条款所读取的关系；当下文结果需要一个序时，它们会采用 $\vartriangleleft$ 的传递闭包，而其中的极小元素、极大元素和线性化也均按此理解。

这些条款引用了 $A$ 本身，所以该定义是沿 $\vartriangleleft$ 进行的递归；下面的引理保证该递归确实存在解。

**引理 68（支持关系是良基的）。** 设 $\prec$ 无环，且 $\gamma$ 由一个步骤序列到达。那么，$\vartriangleleft$ 是良基的，并且 $A$ 是定义 67 的唯一解；它只由 $\tau$、$\pi$、$d$ 和 $p$ 决定。

**证明。** 按照注册每个名称之步骤的索引，对 $\operatorname{dom}(F_\gamma)$ 中的名称进行排序；定义 53 通过让序列从空注册表开始，保证这样的索引存在。$\vartriangleleft$ 的父级分支会沿该索引下降：O-Insert 以 $\pi\in\operatorname{dom}(F_\gamma)$ 为前提，所以父指针所指向的纤程总是更早注册；反复沿父指针前进，会在有限步内走过某个名称的完整祖先链。因此，一个环必然使用 $\prec$；又由于 $\prec$ 无环，它必然混合使用两个分支，而这要求某个 $m$ 声明这样一个键：$m$ 自身子树中的某个纤程可能提供该键。这样的纤程由 $m$ 或 $m$ 的某个后代在激活期间注册，因而注册步骤晚于 $m$ 的 L-Begin；而该 L-Begin 以 $\gamma\vDash d_m$ 为前提，所以提供该键的某个纤程在它之前就已经是 $\mathsf{Active}$。定义 58 的条款 (2) 不允许该键再有第二个可能的提供者。因此，本来会闭合该环的纤程永远不会被注册，相应边也不会出现在 $\operatorname{dom}(F_\gamma)$ 中。良基递归具有唯一解，而其条款只读取上述四个字段。$\square$

最后一个条款读取的是 $p$，即组件可能提供的键；目标所读取的则是 $\operatorname{dom}(\sigma_\gamma)$，即其纤程已经安装的键。定义 43 只通过 $\operatorname{dom}(\sigma_n)\subseteq p_n$ 将二者关联起来。因此，一般而言，支持集会过近似 $\mathsf{Active}$ 纤程；弥合这一差距所需的条件如下。

**定义 69.** 若一个组件 $(d,p,e)$ 的一次激活在完成时已经安装 $p$ 中的每个键，从而使实例化该组件的每个 $\mathsf{Active}$ 纤程都满足 $\operatorname{dom}(\sigma_n)=p_n$，则称该组件**在其供给上是完全的**。

与独立性（定义 60）一样，这是一个只涉及组件的条件，既不提及生命周期状态，也不提及步骤；而独立性已经界定了它能够失效到何种程度：如果某个组件仅在另一个组件的效应能够到达的上下文状态处才安装某个键，那么它的前向映射就不会与另一个组件的前向映射可交换。因此，一个纤程所安装的键由其组件而非调度确定。完全性额外要求的是，这一固定集合等于整个 $p$，而不是 $p$ 的真子集。

**引理 70（静止时的支持）。** 设 $\prec$ 无环，$\operatorname{quiet}(\gamma)$ 成立，$\gamma$ 中没有任何纤程失败，并且 $\gamma$ 的每个组件都在其供给上是完全的（定义 69）。那么，支持集恰好是 $\mathsf{Active}$ 纤程的集合：

$$
A=\{n:\theta_n=\mathsf{Active}(-,-)\}.
\tag{64}
$$

**证明。** 记右侧为 $A'$。由于没有纤程失败，定义 49 的静止条件使 $\mathsf{Inactive}(\bot)$ 与 $\mathsf{Active}$ 成为仅有的状态，并给出

$$
n\in A'
\quad\Longleftrightarrow\quad
\operatorname{target}_n(\gamma)\ne\bot.
$$

根据定义 46，右侧成立当且仅当 $\neg\tau_n$，并且每个 $k\in d_n$ 都属于 $\operatorname{dom}(\sigma_\gamma)$；再根据定义 69，$\operatorname{dom}(\sigma_\gamma)=\bigcup_{m\in A'}p_m$。此处缺少的是目标不再携带的中间条款，而注册过程会补上它：若一个满足 $\pi_n\ne\mathsf{root}$ 的纤程被注册，则只能是在 $\pi_n$ 的一次激活期间；若 $\pi_n\notin A'$，则 $\pi_n$ 并非 $\mathsf{Active}$，所以它的累加器已经运行，并根据定义 47 退役了 $n$，从而使 $\tau_n$ 成立。因此，$A'$ 满足定义 67 的各项条款；引理 68 表明这些条款只有一个解，所以 $A=A'$。$\square$

**引理 71（换位）。** 设各步骤两两独立，$F^t$ 良构，并设步骤 $t$ 与 $t+1$ 分别作用于不同的纤程 $m$ 和 $n$。

1. 若两个步骤都应用激活规则——即 L-Begin、L-Iter 或 L-Finish——且步骤 $t+1$ 在 $\gamma^t$ 处可应用，则步骤 $t$ 也可在步骤 $t+1$ 从 $\gamma^t$ 产生的状态处应用，并且两种顺序到达同一个 $\gamma^{t+2}$。
2. 若步骤 $t$ 在 $m$ 处应用激活规则，步骤 $t+1$ 在 $n$ 处应用编排规则，并且步骤 $t$ 不注册 $n$，则这两个步骤同样可以交换，且两种顺序到达同一状态。

**证明。** 对于 (1)，根据表 1，$m$ 的步骤会写入 $\theta_m$，还会在 $\Psi^t\in\mathfrak{M}(e_m)$ 内部写入表 $\sigma_m$ 和效应部分。因此，它不会改变 $\theta_n$ 和 $i_n$；定义 60 的第二项条件还保证，它不会改变 $i_n$ 所产生的逆函数与后继迭代器。因此，只需检查步骤 $t+1$ 中提及 $\operatorname{target}_n$ 的前提。目标的退役部分不可能失效，因为激活规则不会写入任何 $\tau$。目标的解析部分也不会改变：步骤 $t+1$ 在 $\gamma^t$ 处可应用，意味着每个 $k\in d_n$ 都属于 $\operatorname{dom}(\sigma^t)$；定义 58 的条款 (2) 使提供该 $k$ 的纤程成为唯一可能提供它的纤程，所以 $k\notin p_m$，对 $\sigma_m$ 的任何写入都不会触及 $d_n$ 中的键。反方向使用同一论证，可以证明步骤 $t$ 仍然可应用。最后，根据定义 60 的第一项条件，$\Psi^t\in\mathfrak{M}(e_m)$ 与 $\Psi^{t+1}\in\mathfrak{M}(e_n)$ 可交换；两项编辑又分别写入不同纤程的控制字段，所以无论采用哪种次序，复合结果都相同。

对于 (2)，根据表 1，编排步骤满足 $\Psi^{t+1}=\operatorname{id}_\Gamma$，所以两个状态映射直接可交换；它的 $\operatorname{edit}^{t+1}$ 只会写入 $\tau_n$，或在 $n$ 处写入 $\operatorname{dom}(F_\gamma)$，而激活步骤既不读取也不写入这些内容：后者的前提读取 $\theta_m$、$i_m$、$\tau_m$ 和 $\operatorname{target}_m$；对一个新鲜 $n$ 的 O-Insert 不会改变任何目标，因为一个新鲜纤程尚未提供任何内容；对 $n$ 的 O-Retire 不会改变其表，而 O-Remove 只能在 $n$ 为 $\mathsf{Inactive}$ 时进行，所以二者都会保持 $\sigma_\gamma$ 不变。因此，步骤 $t$ 仍然可应用。反过来，编排步骤的每项前提，要么读取 $n$——而步骤 $t$ 不会写入它——要么属于 O-Insert 的两个前提；更小的注册表只会放宽这两个前提。因此，它在 $\gamma^{t+1}$ 处可应用，便意味着它在 $\gamma^t$ 处也可应用。这里，正是“步骤 $t$ 不注册 $n$”这一条件，保证了在 O-Retire 和 O-Remove 要求 $n$ 存在的 $\gamma^t$ 处，$n$ 已经存在。$\square$

**引理 72（删除）。** 设步骤序列两两独立，每个组件都在其供给上是完全的（定义 69），该序列到达一个静止状态 $\gamma^T$，且其中没有纤程失败；设 $[b,u]$ 是 $n$ 的一个闭合活动期，序列中没有任何满足 $n\prec m$ 的 $m$ 的活动期闭合，并且 $n$ 在 $[b,u]$ 内注册的任何纤程都没有活动期。记 $R$ 为这些注册所抽取的名称集合。那么，从序列中删除 $[b,u]$ 内所有作用于 $n$ 的步骤，再连同所有作用于 $R$ 中某个名称的步骤一并删除，所得步骤序列到达的状态与 $\gamma^T$ 在 $\approx$ 下相等，并且在 $R$ 之外与它在 $\simeq$ 下相等。

**证明。** 被删除的这些步骤合起来，会使状态回到它们开始时的位置。设 $t_1<\cdots<t_l$ 为 $[b,u]$ 内作用于 $n$ 之外纤程的步骤。推论 62 给出

$$
\gamma^{u+1}
\approx
(\Psi^{t_l}\circ\cdots\circ\Psi^{t_1})(\gamma^b),
$$

其右侧正是 $[b,u]$ 中保留下来的步骤单独执行时产生的状态，因为 $\gamma^{b-1}\approx\gamma^b$，并且这些步骤的编辑只写入 $n$ 之外纤程的控制字段，删除操作不会触及这些字段。根据表 1，$n$ 的被删除步骤除 $\theta_n$ 外不写入任何字段；又因为没有纤程失败，引理 54(4) 会在 $u$ 处将该字段恢复为 $\mathsf{Inactive}(\bot)$，而它在 $\gamma^{b-1}$ 处原本就是这个值。

用一个不变量处理余下的后缀。记 $\gamma'^t$ 为保留下来的步骤在对应于 $t$ 的位置处到达的状态。我们断言，对于每个 $t>u$，都有 $\gamma^t\approx\gamma'^t$；$R$ 中每个名称在 $\gamma^t$ 处都是残留的，并且不存在于 $\gamma'^t$；两个状态在 $R$ 之外每个名称的每个字段上都一致。当 $t=u+1$ 时，上一段连同定义 47 给出该断言：在 $u$ 处运行的累加器会退役 $R$ 中的每个名称；这些名称处于 $\mathsf{Inactive}(\bot)$，并持有空表，因为根据假设，$R$ 中的纤程均没有活动期。归纳步骤是在 $R$ 中每个名称处依次应用引理 57(1)：一个作用于 $R$ 之外的步骤在两个状态处具有相同前提，到达的状态仍然在 $\approx$ 下相等，并使 $R$ 中的条目继续保持残留。作用于 $R$ 中某个名称的步骤属于被删除步骤；引理 57(2) 说明了为什么必须将它删除而不能保留——对一个不存在的名称执行 O-Retire 或 O-Remove 时，并没有纤程可供操作；再次根据 (1)，这样的步骤不会改变 $R$ 之外的任何字段，所以丢弃它仍会保持该不变量。因此，最终状态在 $\approx$ 下相等，并且在 $R$ 之外相等。

没有任何保留下来的步骤会失去前提。一个作用于 $m\notin R\cup\{n\}$ 的步骤，只会通过 $\operatorname{target}_m(\gamma)$ 或 $\operatorname{relied}_m(\gamma)$ 读取 $n$。在第一种情形中，只有当 $m$ 声明了一个由 $n$ 提供的键——因而 $n\prec m$——或当 $n$ 注册了 $m$——因而 $m\in R$——时，$\operatorname{target}_m$ 才依赖于 $n$。对于前一种情形，根据假设，$m$ 的活动期不会闭合，所以它在 $\gamma^T$ 处仍然开启；静止性给出 $\omega_m^T=\operatorname{target}_m^T$，引理 70 又表明该视图的值均属于 $\mathsf{Active}$ 纤程，而 $n$ 不在其中。由于一个键至多有一个可能的提供者，在 $m$ 的 L-Begin 处，$n$ 同样没有提供 $d_m$ 中的任何键。第二种读取仅通过 $\omega_n$ 的值读取 $n$；删除该活动期只会使 $\operatorname{relied}$ 变为假，从而放宽 L-Unload 的守卫，而不会阻塞它。这样的步骤对 $R$ 中某个名称的任何读取，都由上述不变量覆盖。两两独立性是效应函数的性质，因此，删除步骤仍会保持它。$\square$

**定理 73（合流性）。** 设一个步骤序列到达静止状态 $\gamma^T$，其中没有纤程失败；设这些步骤两两独立，每个组件都在其供给上是完全的（定义 69），并令 $A$ 如定义 67 所述。则：

1. **（典范形。）** 从 $\gamma^0$ 出发，可以通过一个序列到达 $\gamma^T$，但允许忽略规约化过程中撤回其条目的那些名称；该序列按照原有相对顺序执行相同的编排步骤，其中，作用于编排器所插入纤程的编排步骤先于所有生命周期步骤，其余编排步骤则分别紧随在注册其所作用纤程的步骤之后；对于 $A$ 的一个将 $\vartriangleleft$ 线性化的枚举 $n_1,\ldots,n_k$，该序列按此顺序让每个 $n_i$ 恰好经历一个活动期。
2. **（合流性。）** 从 $\gamma^0$ 出发、执行相同编排步骤的任意两个此类序列，在按引理 56 进行重命名之后，到达的状态同时由 $\simeq$ 和 $\approx$ 关联。

**证明。** 对于 (1)，序列中的活动期分为两类：一类已经闭合，另一类在 $\gamma^T$ 处仍然开启；根据 $\operatorname{quiet}^T$ 和引理 70，后一类恰好是 $A$ 中每个纤程各自的一个活动期。

首先通过对闭合活动期的数量作归纳来处理它们。在每个阶段，选取一个纤程 $n$ 的闭合活动期，使 $n$ 在活动期仍会闭合的纤程中是 $\vartriangleleft$-极大的；根据引理 68 和 $N$ 的有限性，这样的纤程必然存在。此时，引理 72 的三项假设都得到满足。由极大性可知，不存在活动期闭合且满足 $n\prec m$ 的 $m$。此外，$n$ 在 $[b,u]$ 内注册的任何纤程都不会拥有活动期：这样的纤程会被 $u$ 处运行的累加器退役（定义 47），并根据引理 54(5) 始终保持退役，所以它的目标视图为 $\bot$；引理 70 因而把它置于 $A$ 之外，于是它在 $\gamma^T$ 处没有开启的活动期；而 $\vartriangleleft$ 又通过其父指针将它关联到 $n$，所以由极大性可知，它也没有闭合的活动期。该引理删除这一活动期以及所注册名称的各个步骤，并使 $\gamma^T$ 在忽略这些名称后保持不变。度量值减少一，所以最终不再有任何闭合活动期。

$A$ 之外的纤程不会执行任何生命周期步骤。根据引理 70 与 $\operatorname{quiet}^T$，它在 $\gamma^T$ 处没有开启的活动期；此时也已经不再有任何闭合活动期，所以它根本没有活动期，并且始终处于 $\mathsf{Inactive}(\bot)$。在那里唯一可以应用的规则是 L-Begin，而应用该规则就会开启一个活动期。

接下来处理编排步骤。作用于编排器所插入之纤程的一个编排步骤，可以借助引理 71(2)，逐次越过不同纤程的生命周期步骤而向前移动一个位置；该引理之所以适用，是因为 $A$ 中纤程的步骤不会注册这样的名称：注册会抽取新鲜名称，而这里的名称已经由原序列中的一次 O-Insert 引入。遇到同一纤程的生命周期步骤时，无须进行交换：$n$ 的 O-Insert 本就先于 $n$ 的每个步骤，而 $n$ 的 O-Retire 或 O-Remove 只能作用于 $A$ 之外的纤程，后者不会执行生命周期步骤。依次把每个这样的步骤移到前部，会保持它们的相对顺序。若一个编排步骤作用于由某次激活所注册的纤程，它就不能移到序列前部，因为其前提要求该纤程已经存在；因此，它会留在注册该纤程的步骤所在之处。根据上一段，它作用于 $A$ 之外，并且由引理 71 的同一条款可知，它与自己和注册步骤之间的所有步骤都可交换。

最后，通过对 $|A|$ 作归纳，将各个活动期排序并使其连续。设 $n_1$ 是 $A$ 中的一个 $\vartriangleleft$-极小元素。于是 $d_{n_1}=\varnothing$ 且 $\pi_{n_1}=\mathsf{root}$：因为定义 67 会把 $d_{n_1}$ 中某个键的提供者以及注册 $n_1$ 的纤程置于 $A$ 中，而 $\vartriangleleft$ 会把二者都置于 $n_1$ 下方。所以，$\operatorname{target}_{n_1}$ 不读取其他任何纤程的字段；又因为已不再有编排步骤写入 $\tau_{n_1}$，也不再有位于 $n_1$ 下方的纤程将它退役，该目标保持不变。作用于 $n_1$ 的每个步骤都是激活步骤，因为已经没有活动期闭合；这些步骤其余的前提只读取 $\theta_{n_1}$ 和 $i_{n_1}$，而根据表 1，只有 $n_1$ 自身会写入这两个字段。因此，每个这样的步骤在每个更早的状态处都可应用，引理 71 可以在不改变终点的情况下，让它向前移动一个位置。每次应用该引理，位于 $n_1$ 某个步骤之前的其他纤程步骤数都会减少一，所以 $n_1$ 的活动期最终成为一个位于开头的连续块。对该块之后的后缀，在 $A\setminus\{n_1\}$ 上重复这一论证；在该后缀中，$n_1$ 始终为 $\mathsf{Active}$，不再执行步骤，因此它同样贡献一个固定不变的目标。由构造可知，这一过程产生的枚举将 $\vartriangleleft$ 线性化。

对于 (2)，根据 (1)，两个序列都能规约为一个典范序列，而这两个规约所涉及的是同一个 $A$，至多相差一次重命名。定义 67 读取 $\tau$、$\pi$、$d$ 和 $p$；后三者随纤程条目一同写入一次（引理 54(5)）。因此，需要确认的是：两个序列会产生携带相同 $d$、$p$ 和 $\pi$ 的相同名称，并且会退役相同的名称。根据假设，两个序列共享各次插入。它们也共享各次注册：$A$ 中一个纤程的激活会在每次迭代处注册该迭代器所指名的组件，而定义 60 的第二项条件使这一组件在各种交错执行下保持不变，所以一个 $A$ 纤程之下的注册树是该纤程所对应组件的函数。两棵树中这些注册所抽取的名称并不相同，正是在这里应用引理 56，以一个双射匹配这两棵树。退役则要么是两个序列共享的一次编排步骤，要么是某个累加器所执行的 O-Retire；后者恰好退役同一次激活所注册的名称。$\vartriangleleft$ 的两个线性化枚举之间，可以通过对不可比较的活动期进行换位而相互转换；再次应用引理 71 可知，这些换位不会改变终点，所以两个典范序列彼此一致。再结合定理 66 的终止性，生命周期关系因而具有唯一正规形。$\square$

该陈述排除了失败，因为失败确实会造成分歧，而不应把本演算理解为否认这一点：某个步骤是否抛出错误，取决于它运行时所面对的状态，所以一种调度可能使某个纤程失败，而另一种调度则可能让它完成；此时，两个静止状态中该纤程的生命周期状态并不相同。除此之外，二者不会有任何差异；推论 62 表明，失败纤程对状态的贡献为空。

在第 4.2 节的基础演算中，同一定理仍然成立，而证明只需删去一个条款，无须作其他替换。L-Unload 在那里不带守卫，所以引理 72 的最后一段无需再证；该引理的其余部分只诉诸 $\operatorname{quiet}^T$，而基础演算会原样提供这一性质。

该定理使我们可以像面对静态组装的应用那样推理 Cordis 应用。一个编排器添加某个组件、移除它、替换某个提供者，再撤销这次替换之后，保证会到达这样一个状态：若从一开始就写下最终组合，所得到的也正是这个状态；而组件作者在推理哪些余效位于作用域内时，只需考察静止状态。该定理也界定了这项保证的边界：它谈论的是状态，而不是系统沿途产生的发出；第 6.1 节以获取与发出之间的区别表达了这一点——获取留在边界内并受到追踪，发出则跨越边界。

## 5. 实现与案例研究

本节介绍 Cordis，它将第 3 节的形式模型实现为一种实用的编程抽象。Cordis 是一个面向时空可组合性的元框架：与针对特定领域的应用框架（例如 Web 路由、ORM、UI 渲染）不同，它不规定任何具体场景；它的唯一职责是提供通用的动态组合语义。其实现分为三个层次：（1）核心库（第 5.1 节）直接实现效应系统和余效系统；（2）组件加载器（第 5.2 节）在核心库之上扩展配置协调和热模块替换；（3）Koishi（第 5.3 节）等应用框架在前两个层次之上构建领域特定功能。

### 5.1 核心库

表 2 总结了理论构造与其运行时对应物之间的关系。具体来说，本节通篇使用下文引入的运行时名称，而将理论符号保留用于说明形式上的对应关系。我们还用 `@@name` 表示框架内部的符号键，因此 `ctx[@@store]` 中的方括号表示通过符号键访问上下文中的不透明槽位，而不是对以字符串为键的映射进行索引。

| 理论（第 3 节、第 4 节） | 实现 |
| --- | --- |
| $Γ^∞$ | `ctx`，一等上下文 |
| $𝛾 ∈ Γ$ | 上下文树，以及运行中的系统曾触及的一切 |
| $𝔈_Γ, 𝔈_Γ^{iter}$ | 返回／产出逆操作的效应回调 |
| $effect_Γ(𝑒)$ | `ctx.effect(callback)` |
| $Σ, Σ_{iso}, Σ_{inter}$ | `ctx[@@store]`, `ctx[@@isolate]`, `ctx[@@intercept]` |
| $get(𝑘), set(𝑘, 𝑣)$ | `ctx.get(key)`, `ctx.set(key, value)` |
| $isolate(𝑘, 𝑟)$ | `ctx.isolate(key, realm)` |
| $intercept(𝑘, 𝜈)$ | `ctx.intercept(key, metadata)` |
| $⟨𝑑, 𝑝, 𝑒, 𝜋, 𝜎, 𝜏, 𝜃⟩$ | `fiber`，$ℭ_Γ$ 中组件的实例化 |
| $dom(𝐹_𝛾)$ | 通过 `ctx.registry` 枚举 |
| $𝑛: 𝔑$ | `fiber.uid` |
| $𝑑: 𝔇_Γ$ | `fiber.inject` |
| $𝑝: 𝔓_Γ$ | 组件的 `provide` |
| $𝑒: 𝔈^*_Γ$ | `fiber.apply` |
| $𝜋: 𝔑$ | `fiber.parent.fiber.uid`，即拥有该组件实例化所在上下文的纤程（fiber） |
| 派生实现（定义 27） | `fiber.ctx`，纤程在其中运行的子上下文 |
| $𝜃$（定义 44） | `fiber.state`，生命周期状态；其中 `LOADING` 为 $𝖱𝖾𝗅𝗈𝖺𝖽𝗂𝗇𝗀$，`FAILED` 为 $𝖨𝗇𝖺𝖼𝗍𝗂𝗏𝖾(𝜉)$ |
| `recover`，累加器 $𝑔$ | `fiber.dispose`，即该累加器 |
| $𝜔$（定义 44） | `fiber.committed`，已提交的视图 |
| $provider_𝑘(𝛾)$ | 一个 `Impl`，其提供者纤程处于 `ACTIVE` 状态 |
| $target(𝛾, 𝑛)$ | `fiber.target`，由 `refresh`（算法 5）重新计算，其中 $⊥$ 为 `INACTIVE` |
| $𝖥𝗎𝗍𝗎𝗋𝖾$，惯性（第 4.3.3 节） | `fiber.inertia`，进行中迁移的句柄 |
| `O-Insert`, `O-Retire`（定义 47） | `ctx.use` 及其回调的逆操作（算法 4） |
| `O-Remove` | 纤程从其运行时中移除，同时清除 `uid` |
| `L-Begin`, `L-Iter`, `L-Finish` | `execute` 的迭代循环（算法 1） |
| `L-Divert` | 在迭代边界处守卫条件失败（算法 1），或 `reload` 链接至 `unload` |
| `L-Leave` | `refresh` 将纤程标记为 `UNLOADING`（第 10 行） |
| `L-Unload` | `unload` 及其惯性链接（算法 5） |
| `L-Unload` 上的守卫条件 | `unload` 等待已收到通知的依赖者（第 25 行） |
| `L-Raise` | 错误记录在纤程上，并将其目标设为 $⊥$ |

**表 2｜理论与实现的对应关系**

本节余下部分将自底向上构建核心库。第 5.1.1 节实现可逆效应——它是改变上下文的唯一原语；第 5.1.2 节在其上实现反应式余效；第 5.1.3 节将二者组合成组件生命周期；第 5.1.4 节则公开基于它们构建的上下文级操作。

#### 5.1.1 效应追踪

本节实现可逆效应（第 3.1 节）。Cordis 中的每一次上下文变更都流经唯一的原语 `ctx.effect`：余效供给、组件实例化以及其他所有改变上下文的操作，最终都归约为一次 `ctx.effect` 调用。因此，任何通过上下文执行的操作都会被自动追踪，并在组件卸载时恢复。从操作层面看，`ctx.effect` 是 $effect_Γ^{iter}$（定义 52）的实现：它接受一个类型为 $𝔈_Γ^{iter}$ 的回调，并将其提升为 $𝔈_{∂Γ}^{iter}$，产出一个 `dispose` 闭包；调用该闭包时，会恢复这一效应。Cordis 通过这一个操作同时接受 $𝔈_Γ$ 和 $𝔈_Γ^{iter}$（特设多态）；这里以迭代器形式为代表，因为普通效应函数就是只产出单个逆操作的退化迭代器。该操作不会检查的是 $𝔈^*_Γ$ 所携带的见证：回调提供一个逆操作，而这个逆操作确实能够恢复与其相伴的效应，是组件作者应承担的义务，并非运行时验证的性质。定理 61 是演算使用这一义务之处，第 6.1 节则界定了该义务的范围。

算法 1 展示了 `ctx.effect` 的构造。我们用 $𝑓 ∘ 𝑔$ 表示先运行 $𝑔$、再运行 $𝑓$ 的处置函数，用 `id` 表示空操作；因此，将每个新的逆操作前置，就能得到后进先出（LIFO）的恢复顺序。

**算法 1　效应追踪**

```text
1  async function execute(callback, guard)
2      iter ← callback()
3      inverse ← id
4      while guard()
5          (value, done) ← await iter.next()
6          if value then inverse ← value ∘ inverse
7          if done then break
8      return inverse
9  function effect(ctx, callback)
10     armed ← true
11     task ← execute(callback, () ↦ armed)
12     async function dispose()
13         if not armed then return
14         armed ← false
15         recover ← await task
16         recover()
17     ctx.dispose ← dispose ∘ ctx.dispose
18     return dispose
```

引擎 `execute` 将回调作为效应迭代器（$𝔈_Γ^{iter}$，定义 51）驱动，并把每一步产出的逆操作折叠为一个复合逆操作。每一步开始前，它都会查询调用者提供的守卫条件；守卫一旦触发，迭代便会停止，只保留此前累积的逆操作。这就是第 4.3.2 节所述的步骤边界中断：$𝖬𝖺𝗒𝖻𝖾(𝔈^{iter})$ 延续由迭代器的 `done` 标志与 `guard` 共同实现。

`ctx.effect` 是 `execute` 之上的一层轻量包装，额外加入了两项机制。第一，自处置：守卫返回 `armed` 标志，而返回的 `dispose` 会将 `armed` 翻转为 `false`；这既会停止任何正在进行的迭代，又能保证恢复至多触发一次。若触发两次，第二次就会把逆操作应用到一个并非由该效应的应用所产生的状态上，此时没有任何条件能保证它确实会恢复什么。第二，父级组合：`dispose` 被前置到外围上下文累积的逆操作 `ctx.dispose` 中，因此，子效应的逆操作本身就是父级上的一个效应；这正是 $∂^2Γ$ 的递归结构。组件层（第 5.1.3 节）复用同一个 `execute`，但其守卫条件检测的是 `fiber.target` 的稳定性，而非 `armed`。

#### 5.1.2 余效操作

本节实现反应式余效（第 3.2 节）。所有余效操作都作用于每个上下文携带的三个符号键槽位：

- `@@store`：值存储 $𝜎: (𝑟: 𝑅) ⇀ 𝒱_𝑟$，从领域符号映射到有类型的值；
- `@@isolate`：领域表 $𝜌: Map(𝐾, 𝑅)$，从余效键映射到领域符号；
- `@@intercept`：拦截表 $𝜄: (𝑘: 𝐾) → ℳ_𝑘$，为每个键分配其元数据。

前两个槽位组合成两层解析 $𝑘 → 𝜌(𝑘) → 𝜎(𝜌(𝑘))$：`ctx.get(key)`（算法 2）先从 `@@isolate` 读取领域符号 $𝜌(𝑘)$，再从 `@@store` 读取绑定值 $𝜎(𝜌(𝑘))$。借助 $𝜌$ 这一间接层，隔离可以把一个键重定向到独立的绑定；而 `@@intercept` 只在访问绑定时才会被查询，它调整的是绑定的使用方式，而不是绑定解析到什么。我们分两部分实现这些操作：（1）供给与通知，负责安装或撤回绑定，并将变化传播给依赖者；（2）隔离与拦截，负责重塑键的解析方式。

**供给与通知。** 由于 $set(𝑘, 𝑣)$ 的类型为 $𝔈_Σ$（第 3.1 节），余效供给就是一次 `ctx.effect` 调用，并继承其自动追踪和恢复机制。算法 2 实现了 `ctx.set(key, value)`，即具体的 $set(𝑘, 𝑣)$：回调以领域符号 $𝜌(𝑘)$ 为键，把一个值绑定到存储中；返回的 `dispose` 函数则移除该值。安装和移除都会调用 `notify`，将变化传播给依赖组件。

**算法 2　余效操作**

```text
1  function get(ctx, key)
2      realm ← ctx[@@isolate][key] ▷ 𝜌(𝑘)
3      return ctx[@@store][realm] ▷ 𝜎(𝜌(𝑘))
4  function set(ctx, key, value)
5      function callback()
6          realm ← ctx[@@isolate][key] ▷ 𝜌(𝑘)
7          ctx[@@store][realm] ← value ▷ 𝜎[𝜌(𝑘) ↦ 𝑣]
8          notify(ctx, [key])
9          return function()
10             delete ctx[@@store][realm] ▷ 𝜎 ∖ 𝜌(𝑘)
11             notify(ctx, [key])
12     return ctx.effect(callback)
```

算法 3 将每一次绑定变化传播给依赖者：对于每个存活的纤程，它检查发生变化的键是否出现在 `fiber.inject` 中，并且是否解析到同一个领域；若是，便调用 `refresh`（第 5.1.3 节），依据新状态重新求值该纤程；算法还会返回所有被重新求值的纤程，以便调用者等待它们完成。这就是定义 26 中的反应式分类：若某个变化使满足性发生翻转，它就会激活或停用纤程；而 `refresh` 的幂等性使中性变化不产生影响。第 5.1.3 节将进一步阐述这种重新求值与不同控制流之间的交互。

**算法 3　反应式通知**

```text
1  function notify(ctx, keys)
2      affected ← ∅
3      for fiber in all_fibers do
4          for key in keys do
5              if key ∈ fiber.inject and fiber.ctx[@@isolate][key] = ctx[@@isolate][key] then
6                  refresh(fiber)
7                  affected ← affected ∪ {fiber}
8                  break
9      return affected
```

由某个纤程安装的绑定，只有在该纤程处于 `ACTIVE` 状态时，才会被依赖者视为可用。因此，`refresh` 会针对活跃的提供者解析每个已声明的键，而不是仅查询存储。这就是定义 46 中的 provided by 关系；也正因如此，撤回会在实际发生前一步对依赖者可见：一旦提供者进入 `UNLOADING`，它便已停止提供，于是其依赖者会重新计算出一个未满足的目标视图，并在该提供者的所有绑定仍然存在时开始自身的拆卸。

**隔离与拦截。** 这两个操作在结构上执行相同的工作：二者都派生出一个子上下文，针对 `key` 调整一张继承而来的表，同时保持父上下文不变。因此，恢复是隐式的：丢弃子上下文即可，无需运行显式的逆操作。`ctx.isolate(key, realm)` 用 `realm` 覆盖领域映射 $𝜌$；若未提供 `realm`，则默认使用一个新生成的符号（实现 `isolate`，定义 29）。于是，为同一个键分配不同符号的两个上下文会解析到彼此独立的绑定。`ctx.intercept(key, metadata)` 将元数据合并进拦截表 $𝜄$（实现 `intercept`，定义 31）：按照该定义，新元数据会与上下文中 `key` 已有的元数据组合，并优先于已有元数据。

#### 5.1.3 组件生命周期

组件通过 `ctx.use` 实例化为纤程。本节赋予第 5.1 节引入的纤程以操作含义：它就是第 4.3.3 节中的惯性状态机。以下算法由两个字段驱动：`fiber.parent`，即 `fiber.ctx` 的父上下文，它构成组件层级（$Γ^∞$ 的递归结构，第 3.3.1 节）；以及 `fiber.inertia`，即进行中的异步迁移句柄（空闲时为 `null`）。

算法 4 展示组件实例化。组件将余效规约 `component.inject`（$𝑑$）与效应函数 `component.apply` 配对；实例化把组件的 `config` 绑定进 `fiber.apply`（第 9 行），得到应用了配置的效应函数（$𝑒$），随后由生命周期运行该函数。`callback` 函数（第 2 行）是在父纤程中追踪的效应：执行时，它通过调用 `refresh`（算法 5）启动子纤程的生命周期；恢复时，它强制把子纤程的目标设为 $⊥$，并触发 `unload`。这就是定义 47 的注册原语，其中 `callback` 是其 `O-Insert`，而 `callback` 返回的闭包是其 `O-Retire`：实例化是父级的普通受追踪效应，因此卸载父级会级联卸载其子级。

**算法 4　组件实例化**

```text
1  function use(ctx, component, config)
2      function callback()
3          refresh(fiber)
4          return function()
5              fiber.target ← ⊥
6              unload(fiber)
7      fiber ← Fiber(parent: ctx, inject: component.inject)
8      fiber.ctx ← ctx[fiber ↦ fiber]
9      fiber.apply ← () ↦ component.apply(fiber.ctx, config)
10     ctx.effect(callback)
11     return fiber
```

算法 5 实现第 4.3.3 节的惯性状态机，其中 `reload` 和 `unload` 都具有惯性：迁移一旦进入，就会运行至完成，之后系统才会响应目标状态的变化。它对余效存储使用两个辅助查询：`resolve(inject)` 返回当前由已声明的键解析出的绑定，`provided(fiber)` 返回由该纤程安装了绑定的键。`refresh` 函数从余效存储重新计算 `fiber.target`；若纤程尚未处于迁移中，则根据目标启动 `reload` 或 `unload` 任务<sup id="note-ref-2-1"><a href="#note-2" aria-label="注 2">2</a></sup>。`reload` 函数记录当前目标，并执行组件的效应函数 `apply`。完成后，它检查目标是否仍然匹配：若匹配，纤程进入 `ACTIVE`；若不匹配（无论新目标是 $⊥$ 还是另一组提供者），则链接至 `unload`。与之对称，`unload` 按后进先出顺序恢复所有受追踪效应，随后进入 `INACTIVE`，或链接至 `reload`。这种相互递归实现了惯性性质：一旦某次迁移开始，它就会先完成，之后任何新迁移才能开始。

**算法 5　组件生命周期**

```text
1  function refresh(fiber)
2      target ← target(𝛾, 𝑛)
3      if target = fiber.target then return
4      fiber.target ← target
5      if fiber.inertia then return
6      if target ≠ ⊥ then
7          fiber.state ← LOADING
8          fiber.inertia ← create_task(reload(fiber))
9      else
10         fiber.state ← UNLOADING ▷ 在调度任何逆操作之前停止服务
11         fiber.inertia ← create_task(unload(fiber))
12 async function reload(fiber)
13     target0 ← fiber.target
14     fiber.committed ← resolve(fiber.inject) ▷ 提交视图
15     recover ← await execute(fiber.apply, () ↦ fiber.target = target0)
16     fiber.dispose ← recover ∘ fiber.dispose
17     if fiber.target = target0 then
18         fiber.state ← ACTIVE
19         notify(fiber.ctx, provided(fiber))
20         fiber.inertia ← null
21     else
22         fiber.state ← UNLOADING
23         fiber.inertia ← create_task(unload(fiber))
24 async function unload(fiber)
25     await all(notify(fiber.ctx, provided(fiber)).map(f ↦ f.await())) ▷ 等待依赖者全部完成退出
26     await fiber.dispose()
27     fiber.dispose ← id
28     fiber.committed ← ⊥
29     if fiber.target = ⊥ then
30         fiber.state ← INACTIVE
31         fiber.inertia ← null
32     else
33         fiber.state ← LOADING
34         fiber.inertia ← create_task(reload(fiber))
```


`fiber.target` 的计算方式，是针对当前余效存储解析每个已声明的键，并将提供该键的纤程之 `uid` 组成元组，因此它是 $target(𝛾, 𝑛)$（定义 46）的摘要。用提供者而不是其值来标识绑定，使得只需与记录的目标进行一次比较便已足够：`uid` 每次都会重新生成且绝不复用，因此，即使替代前后的两个提供者给出相等的值，也不会把新提供者误认成它所替代的旧提供者。由于 `notify`（第 5.1.2 节）会在每次余效变化时重新计算目标，因此，仅当纤程声明的某个键开始由不同纤程提供时，该纤程才会重新加载。所以，提供者在原地覆写自身绑定的行为不会被观察到；若组件希望其替换传播出去，就应撤回绑定并重新安装。

该算法在两个互补层级上运作。在迁移层级，`reload` 和 `unload` 会在完成时检查目标，从而支持跨迁移的惯性链接。在每次迁移内部的迭代层级，效应执行（算法 1）会在每个迭代边界检查目标，从而支持单次迁移内的部分回滚。这两种机制分别对应第 4.3.3 节的迁移间链接，以及定理 64 所依赖的迁移内陈旧性检查。

有三行承载着定理 63 的余效顺序，而它们各自所在的位置正是该顺序得以成立的原因。`reload` 在第 14 行提交已解析的视图，而 `unload` 只有在每个逆操作都运行后才丢弃该视图，因此，只要纤程仍处于已加载状态——包括其自身的拆卸期间——它所读取的始终是同一组绑定。`refresh` 在创建迁移任务之前，先于第 10 行把纤程标记为 `UNLOADING`；这就是 `L-Leave` 步骤：该纤程停止提供，而依赖者会据此重新计算，且这一切发生在调度该纤程的任何逆操作之前。随后，`unload` 在第 25 行等待每个收到通知的依赖者进入 `INACTIVE`，这就是 `L-Unload` 上的守卫条件；只有当依赖者声明的键解析到与提供者相同的领域符号时，`notify` 才会纳入该依赖者。这是该守卫条件之要求的运行时形式：依赖者必须从这个纤程取得该键，而不能只是声明该键。等待位于整个恢复过程之前，而不是置于某个正被等待的逆操作内部，因为 `fiber.dispose` 会并发启动一个纤程的各个效应；若把等待放在其中一个效应内部，其余效应仍将没有顺序约束。终止性来自定理 66：纤程只会等待那些已经无法被满足的依赖者；若某个依赖者自身也是提供者，它也会以同样方式等待自己的依赖者。因此，提供者图是在需要时遍历的，而不是预先分析的。

<p id="note-2" class="footnote-note"><sup>2</sup> <code>create_task</code> 调度一个异步函数并发运行，并返回它的句柄（存储在 <code>fiber.inertia</code> 中）。为保持语言无关性，我们将它显式写出：在采用急切调度的语言中（例如 TypeScript 的 Promise），调用是隐式的，返回的 Promise 就是句柄；而在采用惰性调度的语言中（例如 Python 协程、Rust future），宿主必须生成该任务，它才会继续推进。 <a href="#note-ref-2-1" aria-label="返回正文注 2">↩</a></p>

#### 5.1.4 上下文访问

第 5.1.2 节中的余效操作构成了一套反射式 API：通过 `ctx.set(key, value)` 写入余效，通过 `ctx.get(key)` 读取余效，二者都以名称作为键。在这套反射式 API 之上，Cordis 又提供了一种更贴近语言原生风格的方式来扩展和使用上下文：属性访问。组件可以像访问上下文自身的原生结构一样，通过属性 `ctx[key]` 访问余效，而无须调用方法。在 TypeScript 中，Cordis 使用 `Proxy` 来实现这一点，其 `get` 陷阱会中介每一次属性访问。算法 6 展示了上下文如何在第 5.1.2 节的基础 `get` 操作之上，将这类访问解析为余效。

**算法 6　由代理中介的上下文访问**

```text
1  function resolve(ctx, key)
2      fiber ← ctx.fiber
3      repeat
4          if key ∈ fiber.committed then return fiber.committed[key]
5          if key ∈ fiber.inject then throw INACTIVE_ACCESS
6          if fiber = root then throw UNDECLARED_ACCESS
7          fiber ← fiber.parent.fiber
```

算法 6 从发起访问的上下文开始，沿纤程链向上遍历：一旦遇到首个其已提交视图绑定了 `key` 的纤程，就授权此次访问并返回该绑定；如果遍历到某个声明了 `key` 却尚未提交它的纤程，则说明该纤程尚未加载，访问失败；如果一直到达根纤程都没有任何声明，则以“未声明”为由拒绝访问。这正是代理与裸 `ctx.get` 的区别所在：`ctx.get(key)` 只在存储中查找，返回已绑定的值或空值，而且永远不会失败；代理则依据发起访问的纤程自身视图进行解析，并在使用点强制执行余效规约 $d$。读取视图而非存储也是定理 63 得以成立的基础，因为正是这一点，才使得某个组件即使因其依赖消失而开始拆卸，仍能在拆卸期间读取该依赖。

这种拒绝是在访问发生时执行的运行时检查。由于组件的余效规约 $d$ 是静态声明的，原则上也可以在编译时发现同一种违规：在执行之前，依据声明的 $d$ 解析每一处 `ctx[key]`。第 6.4 节将讨论宿主语言的类型级依赖声明与编译期元编程如何恰好实现这种中介。

### 5.2 组件加载器

核心库为组件开发者提供了用于动态组合的命令式原语，例如 `ctx.effect`、`ctx.use` 和 `ctx.set`。应用编排者面对的则是另一项独立关注点：他们需要将预先存在的组件组装成一个运行中的系统，并在系统的整个生命周期内调整其组合方式。组件加载器通过引入声明式配置层来处理这一关注点：编排者以持久化数据结构的形式规定期望的组合，而加载器则把该规约的变化转化为相应的命令式纤程操作。

#### 5.2.1 声明式配置

第 4 节将一个运行中的系统分解为纤程，每个纤程都是某个组件的一次实例化。一次实例化所需的一切都可以声明出来，因此，编排者可以用声明式配置描述整个系统：这是一份持久记录，由加载器将其实现为纤程，并使其始终与这些纤程保持同步。

**条目。** 配置由条目组成。每个条目都规定并管理一个纤程，而且二者之间的绑定是双向的：当条目的字段发生变化时，加载器会相应调整纤程；当组件修改自身配置或禁用自身时，这一变化也会被写回其条目。

**定义 74.** 一个条目声明单个纤程，并记录：

- `id`——稳定标识符；当条目所在分组的子项列表发生变化时，用作协调键；
- `url`——要实例化的组件模块 URL；
- `isolate`——应用于该条目上下文的隔离标注；
- `intercept`——应用于该条目上下文的拦截标注；
- `config`——绑定到组件、从而形成其效应函数 `apply` 的配置；
- `disabled`——该条目是否已被管理性关闭。

条目之所以能够充当忠实的规约，是因为支撑一个纤程所需的信息，恰好就是条目所记录的信息。定义 67 的支撑集读取且仅读取 $\tau$、$\pi$、$d$ 和 $p$，而条目恰好给出了这四者：`disabled` 给出 $\tau$，条目在树中的父项给出 $\pi$，`url` 则选定声明 $d$ 与 $p$ 的组件。支撑集未读取的字段是纤程的运行时状态，而实例化同样不需要这些状态；只要每个组件都会安装自己声明的每一个键（定义 69），引理 70 就把支撑集等同于静止状态（定义 49）中的 $\mathsf{Active}$ 纤程。

这些条目组成一棵配置树，它是系统加载内容的权威记录。条目可以是映射到单个纤程的叶节点；它的组件也可以继续加载其他组件，使该条目成为分支节点。Cordis 为这种分组式和嵌套式加载提供了相应组件：`@cordisjs/group` 以子条目列表作为配置，并将其作为一个子组加载；`@cordisjs/include` 则加载外部配置文件（YAML 或 JSON），并把其中的条目作为嵌套子树嫁接进来。两者都是建立在定义 47（算法 4）的注册原语之上的普通组件，因此，嵌套树仍处于该演算之内，下文的结果也同样适用于它。

**协调。** 当条目的记录发生变化时，加载器会进行增量协调，而不是拆掉整个纤程再从头重建。元理论给出了这种协调方式之所以可靠的理由。

- 定理 73 使静止状态仅成为最终配置的函数：无论加载器在此过程中执行了哪些实例化与退役操作，也无论这些操作采用何种顺序，系统最终都会静止在这样一个状态——从头加载最终配置也会得到同一状态。只要每个组件都会安装自己声明的每一个键（定义 69），最终加载哪些组件便可仅从声明中读出；如果某组件声明了一个键，却只在部分配置下安装该键，加载器仍然能够协调该组件，不过此时已加载组件的集合也会取决于这些配置。
- 定理 66 证明了系统确实会达到静止状态，因此，一旦协调所需的实例化与退役操作均已发出，本次协调最终便会完成。
- 推论 62 表明，即将离开的纤程对状态的贡献归于无，因此，重建某个条目会撤回其纤程安装的内容，同时让周围的纤程保持原状。
- 定理 63 允许同时实例化各个条目，编排者无须安排加载顺序：如果某纤程所声明的键尚未得到提供，它会在自己的 L-Begin 处等待；如果其提供者离开，它会先于提供者被停用。因此，依赖约束的是纤程何时激活，而不是何时获取并求值其模块；加载器由此可以并发加载模块，而大型配置的启动时间主要就花在这些模块加载工作上。

在条目所声明的纤程之上，加载器会根据条目中发生变化的字段进行分派，并针对每个字段采用干扰最小的操作。

- `id`、`url`——重建条目，因为条目的身份或组件已经改变；
- `isolate`——重新分配条目的域（算法 7）；
- `intercept`——原地更新，因为拦截元数据是在读取时查询的，无须重新加载；
- `config`——交给组件，由组件决定如何应用新的载荷；通常做法是将其与上一份配置求差异，仅在发生实质变化时才重新加载。特别地，`@cordisjs/group` 条目的 `config` 就是其子条目列表，因此它会以子项 `id` 为键，对更新执行差异比较，逐个创建、移除或更新子项；由于更新一个仍然存在的子项会再次进入同一套逐字段分派，分组协调与条目更新会共同沿配置树递归向下进行；
- `disabled`——设置时卸载纤程，清除时重新加载纤程。

**受管域。** 核心库中的隔离会派生出一个子上下文，并在某个键上覆写域表 $\rho$（第 5.1.2 节）；只要上下文树保持不动，这便足够了。条目可能会在运行时于不同分组之间移动，因此加载器会管理自己的域，而 `isolate` 字段会为每个键选择两种作用域规则之一。值为 `true` 表示要求一个局部域：它为该条目私有，以条目的 `id` 为标记，并且无论条目移动到哪里都会随其一同移动；字符串值则表示要求一个全局域：所有指定该字符串的条目共享此域，因此，移动这样的条目会改变它与哪些条目共享绑定，而不会改变它属于哪个域。一旦不再有任何条目指定某个域，该域就会被丢弃。

重新分配条目的域时，需要根据以下三点采取操作：哪些键改变了域；条目本身是否就是某个已更改键的提供者；以及需要通知哪些依赖方。其中第二个问题最棘手，因为同一个域符号可能由多个纤程共享，而其中只有一个是提供者。加载器通过分隔符来回答这个问题：每个键对应一个符号 $\delta_k$，每个上下文都在该符号下存储自己的标记。分隔符被写入某个上下文，并由其后代继承，因此，当且仅当条目与提供者都是在 $k$ 的同一个隔离作用域内派生时，条目的标记才会与提供者的标记一致；也只有在这种情况下，$k$ 处的绑定才属于该条目自身，因而必须随它一同移动。

**算法 7　隔离域重新分配**

```text
1  function patch_isolation(entry, 𝜌′)
2      𝜌 ← entry.ctx[@@isolate]
3      store ← entry.ctx[@@store]
4      Δ ← {𝑘 | 𝜌(𝑘) ≠ 𝜌′(𝑘)}  ▷ 域发生变化的键
5      for 𝑘 in Δ do
6          entry.ctx[𝛿𝑘] ← fresh tag
7          diff[𝑘] ← (𝜌(𝑘), 𝜌′(𝑘), entry.ctx[𝛿𝑘], store[𝜌(𝑘)].fiber.ctx[𝛿𝑘])
8      entry.ctx[@@isolate] ← 𝜌′
9      reload(entry.fiber)
10     for 𝑘 in Δ do
11         (𝑠1, 𝑠2, 𝑑1, 𝑑2) ← diff[𝑘]
12         if 𝑑1 = 𝑑2 and store[𝑠1] and not store[𝑠2] then  ▷ 该绑定属于条目自身
13             store[𝑠2] ← store[𝑠1]
14             delete store[𝑠1]
15     function affected(fiber, 𝑘)
16         (𝑠1, 𝑠2, 𝑑1, 𝑑2) ← diff[𝑘]
17         return fiber.ctx[@@isolate][𝑘] ∈ {𝑠1, 𝑠2} and (fiber.ctx[𝛿𝑘] = 𝑑1) ≠ (𝑑2 = 𝑑1)
18     notify(entry.ctx, Δ, affected)  ▷ 代替算法 3 中的域检验
```

这一检验取决于分隔符的一项性质。$\delta_k$ 下的标记被写在条目的上下文中，并由从该上下文派生的每一个上下文继承；而且每次重新分配时都会生成全新的标记。因此，对任意上下文 $\gamma'$，都有

$$
\gamma'[\delta_k] = d_1
\quad\Longleftrightarrow\quad
\gamma' \text{ 由该条目的上下文派生而来}
\tag{65}
$$

将这一条件记为 $\operatorname{own}(\gamma')$；在提供者处，它的实例就是 $d_2 = d_1$。重新分配会把满足 $\operatorname{own}$ 的上下文从 $s_1$ 移至 $s_2$，其余上下文则留在原处；根据上面的循环，当且仅当提供者满足 $\operatorname{own}$ 时，绑定也会被移至 $s_2$。依赖方自身在 $k$ 处的域与绑定所在的域一致时，它就能看到该绑定。如果依赖方与提供者在 $\operatorname{own}$ 上的取值相同，那么二者要么一起移动，要么都不移动，因此，依赖方在重新分配后能够看到该绑定，当且仅当它在重新分配前也能看到该绑定。如果 $\operatorname{own}$ 将二者区分开来，则一方移动而另一方留在原处，依赖方因而会获得或失去该绑定。算法中的不等式表达的正是这种分离；成员关系检验则排除那些在两个域中都不解析 $k$ 的依赖方，因为此次移动的任何部分都不会触及它们。

#### 5.2.2 热模块替换

热模块替换（HMR）在模块层面应用了可逆效应模式：当源文件发生变化时——通常是在开发期间——系统会原地替换受影响的模块，而无须重启进程。由于纤程已经界定了其组件的全部效应和余效，本身就是组件的模块只需通过纤程操作即可完成替换：处置旧纤程会撤回该组件安装的一切，而从重新加载的模块实例化一个新纤程，则会重新安装这些内容。因此，与 Webpack [46] 或 Vite [47] 的 HMR 不同，Cordis 的 HMR 不需要由开发者标注接受边界。

`@cordisjs/hmr` 组件提供 HMR 引擎，其运行分为三个阶段。

**阶段 1：模块分类。** 引擎接收两个输入：`stashed` 集合（自上次重新加载以来内容发生变化的文件 URL）与 `externals` 集合（无法热替换、因而会触发完整重启的模块）。用 `get_imports(url)` 表示 `url` 直接导入的模块；引擎据此对这些变更的依赖子图进行分类，将每个模块标记为 `accepted` 或 `declined`：

**算法 8　模块分类**

```text
1  function classify(stashed, externals)
2      accepted ← stashed
3      declined ← externals
4      pending ← ∅
5      for url in stashed do
6          pending ← pending ∪ (get_imports(url) ∖ (accepted ∪ declined))
7      repeat
8          progress ← false
9          for url in pending do
10             if get_imports(url) ∩ accepted ≠ ∅ then
11                 accepted ← accepted ∪ {url}
12                 pending ← pending ∖ {url}
13                 progress ← true
14             else if get_imports(url) ⊆ declined then
15                 declined ← declined ∪ {url}
16                 pending ← pending ∖ {url}
17                 progress ← true
18             else
19                 pending ← pending ∪ (get_imports(url) ∖ (accepted ∪ declined))
20     until not progress
21     declined ← declined ∪ pending
22     return (accepted, declined)
```

以 `stashed` 文件所导入的模块为初始种子，这个不动点过程会在某个模块的任一导入已被接受时接受该模块，并在其全部导入均已被拒绝时拒绝该模块；任何仍未确定、陷在导入环中的模块，默认都会被拒绝。

**阶段 2：过期条目检测。** 随后，引擎利用 `accepted` 和 `declined` 将组件条目筛选为其中的过期条目，也就是依赖树能够到达已变更模块的条目。它使用 `get_dependencies` 遍历每个条目的依赖树；该函数以 `declined` 为边界，收集模块的传递导入：

**算法 9　过期条目检测**

```text
1  function get_dependencies(root, declined)
2      deps ← ∅
3      function traverse(url)
4          if url ∈ deps or url ∈ declined then return
5          deps ← deps ∪ {url}
6          for child in get_imports(url) do traverse(child)
7      traverse(root)
8      return deps
9  function detect(entries, accepted, declined)
10     stale_entries ← ∅
11     for entry in entries do
12         tree ← get_dependencies(entry.url, declined)
13         if tree ∩ accepted ≠ ∅ then
14             accepted ← accepted ∪ tree
15             stale_entries ← stale_entries ∪ {entry}
16     return stale_entries
```

当且仅当一个条目的依赖树与 `accepted` 相交时，该条目才是过期条目；随后，这棵依赖树也会并入 `accepted`，使沿途每个过期模块的缓存都在下一阶段失效。

**阶段 3：事务式重新加载。** 最后，引擎重新加载过期条目。它会使 `accepted` 模块的缓存失效<sup id="note-ref-3-1"><a href="#note-3" aria-label="注 3">3</a></sup>，同时备份每一个被移除的模块以支持回滚；随后，它按各过期条目的 `url` 重新导入其组件模块，并换入一个全新的纤程：

**算法 10　事务式模块重新加载**

```text
1  function reload(ctx, accepted, stale_entries)
2      backup ← invalidate_caches(accepted)
3      try
4          for entry in stale_entries do
5              entry.fiber.dispose()
6              entry.fiber ← ctx.use(import(entry.url), entry.config)
7      catch error
8          restore_caches(backup)
9          for entry in stale_entries do
10             entry.fiber.dispose()
11             entry.fiber ← ctx.use(backup[entry.url], entry.config)
12         throw error
```

事务保证确保系统绝不会进入只重新加载了一半的状态：如果任何模块导入失败（例如存在语法错误），缓存就会被恢复，而且每个过期条目都会使用 `backup[entry.url]` 重建；后者正是刚刚恢复缓存的旧组件，由此撤销已经完成的纤程替换。


### 5.3 案例研究：Koishi

Koishi 是一个基于 Cordis 构建的开源聊天机器人应用框架<sup id="note-ref-4-1"><a href="#note-4" aria-label="注 4">4</a></sup>。经过四年多的发展，它已经积累了 4000 多个由社区贡献的插件<sup id="note-ref-5-1"><a href="#note-5" aria-label="注 5">5</a></sup>，涵盖即时通信（IM）适配器、数据库驱动、管理控制台和面向最终用户的功能。它的规模与多样性，使其成为在生产环境中验证 Cordis 动态可组合性的代表性案例。


**元框架的表达力与通用性。** Koishi 以服务端机器人形式运行，其中每一项功能都实现为建立在第 5.1 节上下文原语之上的插件；Koishi 自身只提供聊天机器人领域的词汇。同一种模型还出现在完全不同的运行时中：Koishi 的 Web 控制台是另一个独立的 Cordis 应用，其插件组合的是浏览器及其用户界面的原语，而非服务端原语。上述截然不同的场景确立了第 3 节模型的两项性质。（1）它具有表达力：其原语足以承载一个完整的生产系统，宿主框架只需提供领域词汇。（2）它具有通用性：它规定效应与余效如何组合，却把二者的含义留给各个应用决定，因此既不预设特定领域，也不预设特定运行时。

**无需额外认知负担的时间可组合性。** 第 1.2.1 节所考察的插件系统无法卸载单个扩展的效应，除非重启扩展宿主。Koishi 经常执行这种操作：编排器从控制台禁用某个插件，其效应便会原地撤回；在开发期间，HMR 引擎会在保存时重新应用经过编辑的插件，同时保留缓存状态以及系统其他部分的活动连接。Cordis 不仅使这种移除成为可能，还让插件作者能够毫不费力地做到这一点。由于通过上下文执行的效应都会受到追踪，其逆也会自动组合（第 3.1 节），即便缺乏经验的作者没有编写卸载路径，也能让插件中经上下文中介的效应得到有序清理。这实现了第 1.2.1 节所指出其缺失的关注点局部性：原本有赖于每位作者尽责才能保证的正确性，转而由这一抽象一次性承担。

**跨开放生态系统的空间可组合性。** 与第 1.2.1 节所述、插件间依赖关系基本缺失的插件系统不同，Koishi 的生态系统呈现出真正的依赖拓扑：即时通信适配器提供对各个消息平台的访问，数据库驱动提供持久化存储，功能插件则将这些能力声明为余效并加以访问。在运行时重新配置提供方，例如切换存储后端或重新连接适配器，只会重新激活那些已解析依赖发生变化的依赖方（第 3.2 节）；依赖不可用的插件会保持非活动状态，直到该依赖出现，而不会报错。这个案例研究所证实的是，这种组合能够跨越由不同作者独立编写的代码而成立：插件及其依赖通常由不同作者编写，彼此之间除了连接它们的余效之外无需进行任何协调；因此，反应式余效能够使这个由独立贡献者组成的开放生态系统始终保持组装一致性。

**有效性威胁。** 此处的证据来自采用单一宿主语言的单一生态系统，因此无法将这一范式本身的优点，与其 TypeScript 实现或 Koishi 特定领域的优点区分开来；而且这些证据来自观察，并非与另一种架构进行的受控比较。因此，这项案例研究所得出的是一个关于该范式确实存在且已获采用的结果，而不是定量结果；衡量这一抽象的开销，并以某个基线为参照评估它对开发者生产力的影响，仍有待未来研究。

<p id="note-3" class="footnote-note"><sup>3</sup> 在 Node.js 上，这意味着同时清除 ES 模块系统与 CommonJS 模块系统的缓存，因为通过 ES 加载器导入的模块可能同时出现在二者之中。 <a href="#note-ref-3-1" aria-label="返回正文注 3">↩</a></p>

<p id="note-4" class="footnote-note"><sup>4</sup> Koishi 目前使用 Cordis v3。本文介绍的是 Cordis v4，它细化了效应与余效语义，并重新设计了加载器；两个版本共享相同的核心组合模型。 <a href="#note-ref-4-1" aria-label="返回正文注 4">↩</a></p>

<p id="note-5" class="footnote-note"><sup>5</sup> Koishi 使用“插件”一词来指代本文形式化为“组件”的概念。 <a href="#note-ref-5-1" aria-label="返回正文注 5">↩</a></p>

## 6. 讨论

前述各节给出的形式化模型与实现引入了一种面向动态可组合性的编程范式。本节考察该范式如何扩展至更广泛的工程问题，并讨论其中的设计张力与开放问题。

### 6.1. 系统边界

第 3.1 节中的每个效应都携带一个逆，而这个逆究竟意味着什么，由系统边界决定。该边界将系统运行时所面对的环境分为两部分。（1）如果系统能够排他地修改某个位置，并能恢复该位置在修改前的状态，那么该位置就在边界之内；因此，对它的操作会在 $\Gamma$ 中受到追踪，之后也可以恢复。（2）如果上述任一能力不成立，那么该位置就在边界之外；因此，对它的操作表现为 $\mathrm{id}_{\Gamma}$，既不会被追踪，也不会被恢复。本节将阐述这一边界的性质，以及这些性质对恢复的影响。

**由余效形成的边界。** 余效通过将外部位置具体化来移动边界：它把对该位置的一切访问都限制在自己所提供的一组操作之中，并且能为其中每项操作提供一个逆；于是，原本表现为 $\mathrm{id}_{\Gamma}$ 的操作开始在 $\Gamma$ 中受到追踪，并可得到恢复。因此，边界是按位置而非按介质划定的，因为前述两种能力都是位置的属性，而具体化改变的是访问某个位置的方式，并不改变该位置所在的介质。例如，当一块内存区域只有系统自身能够写入时，它位于边界之内；当其他进程也能写入时，它则位于边界之外。类似地，当一个文件只有系统能够访问——例如，位于私有路径下的临时文件——它便位于边界之内；当它所在的路径还会被其他程序读写时，它则位于边界之外。移动边界本身就是一种权衡：一边是环境是否为某个位置提供可逆语义，另一边是为每次访问提供这种语义所需付出的成本。第 6.7 节将进一步讨论由此引出的协同设计。

**获取与发出。** 一个越过边界的操作通常分两个阶段进行。（1）在获取阶段，操作取得访问权，并在边界内安装一条记录：`open` 安装一个由 `close` 移除的描述符，`malloc` 预留一块由 `free` 释放的内存，`fork` 启动一个由 `kill` 终止的子进程。这条记录本身是将该位置具体化的余效的一部分，例如，它可以是余效所维护的映射中的一项；安装该条目则是一个可逆效应。与此同时，这条记录也是数据离开系统所经由的通道。（2）在发出阶段，操作通过该通道推出数据，例如 `write` 交给文件的字节，或 `send` 放到网络线路上的数据报；这种推出表现为 $\mathrm{id}_{\Gamma}$，数据会留在其他参与方能够读写的位置。因此，这两个阶段分处边界两侧：获取留在边界之内，发出则跨越边界、到达外部。

**暂缓与补偿。** 尽管如此，一个必须从发出操作中恢复的系统仍有两种可用方法。其一，暂缓发出，直到能够确定产生该输出的状态将被持久保留；这正是回滚恢复中的输出提交问题 [48]。其二，采用补偿 [49]：执行某项动作，把状态恢复到应用所给出的某种等价关系下；这种等价关系比定义 33 中的 $\simeq$ 更粗，例如删除先前创建的文件，或退还已经收取的款项。此类动作与逆一样，按相同的后进先出（LIFO）顺序组合，因此第 3.1 节的组合方法同样适用于它们。但元理论并不能随之直接沿用：定义 60 中的交换性是相对于 $\simeq$ 证明的，必须针对这个更粗的等价关系重新建立。

### 6.2. 服务多路复用

OSGi [50] 等动态组件平台围绕服务来组织组合：服务是提供方依据某个接口发布、消费方随后绑定的一组功能。Cordis 的余效模型与这一概念相呼应，其中，一个服务对应某个键背后的接口。提供服务的组件是该服务的提供方，注入服务的组件则是它的消费方。一个服务可以由多个提供方实现，而这种多重性可以采用两种形式。（1）**独占绑定**：多个实现共享同一个接口，但任一时刻至多只能绑定其中一个；编排器选择要绑定的实现，而在实现之间切换时，必须先卸载一个提供方，再加载另一个，这会短暂扰动每个消费方的依赖。（2）**服务代理器**：一个充当该接口入口点的中心服务，同时由后端提供方和消费方注入；这样，多个提供方可以共存，而代理器负责把每项请求分派给它们中的某一个。与独占绑定相比，代理器会吸收这种扰动：更新某个后端提供方时，代理器本身仍保持原位，因此消费方观察不到其依赖发生变化，也不会触发重新加载。

服务代理器构成三种能力的基础：负载均衡、滚动更新和跨进程调用。

**负载均衡。** 当多个提供方共存时，代理器依据可配置的策略（例如轮询、最小负载或延迟加权），或者依据消费方明确指定的目标，在它们之间分发请求。由于提供方都是普通组件，可以通过添加或移除提供方来扩大或缩减容量；每个提供方都通过一个可逆效应向代理器注册，因此卸载该提供方会撤销这项注册，并自动将其从代理器的路由集合中移除。

**滚动更新。** 在运行时升级服务实现，可以归结为一次受控的提供方迁移 [51, 52]。执行这项迁移时，新的提供方作为一条额外纤程（fiber）加载，并向代理器注册；当它进入 `ACTIVE` 状态后，流量便逐步从旧提供方转移至新提供方（例如，通过调整选择权重），而旧提供方则会在不再承载进行中的请求后卸载。这种提供方迁移把传统上属于基础设施层的操作（例如容器编排、蓝绿部署）转化为一种应用层的组合模式。

**跨进程调用。** 服务代理器还可以跨越进程边界使用 [53]。每个进程都托管自己的 Cordis 上下文及本地提供方；一个协调组件把这些进程连接起来，并将每个进程视为远程提供方。跨进程服务访问由一种保留原接口的 RPC 机制中介，因此这种分布对消费方是透明的。需要注意的是，跨进程调用会引入延迟，也可能在执行途中失败，因此若以同步方式暴露，就会阻塞调用方。为跨进程暴露而设计的接口必须采用异步契约。

### 6.3. 访问控制与沙箱化

对于一个由独立组件组装而成的应用，保障其安全需要两种互补机制：（1）约束组件可以访问哪些依赖；（2）通过沙箱将不受信任的代码与宿主环境隔离。Cordis 通过依赖声明和拦截支持第一种机制；第二种机制则需要外部沙箱。

**基于能力的访问控制。** 依赖访问机制（第 5.1.4 节）本身已经构成了对代理所中介属性的一种访问控制：组件只能访问自己声明过的依赖；访问未声明的依赖会引发错误。这在结构上类似于基于能力的安全机制 [54–56]：权限由持有引用来授予，而不是来自环境权限。`inject` 声明充当能力请求，上下文代理则充当能力中介。由于这些请求是静态声明的，组件所需的、经代理中介的完整能力集合在运行前便已知晓；编排器因而可以在加载时审查并批准这些能力，而不必等到访问实际发生时才发现它们。

借助拦截机制，这种中介还可以推广至细粒度策略。访问控制元数据可以由上下文携带，也可以由组件声明（定义 30）；调用依赖时，提供方查询这些元数据，以决定是否允许请求。例如，文件系统依赖可以携带元数据，声明组件能够读取或写入哪些路径，而提供方会逐次根据元数据检查调用。因为这种拦截存在于上下文上，而不在任一方的代码中，所以编排器无需修改提供方，就能调整拦截规则，约束任意组件对依赖的访问；例如，它可以只向社区组件授予数据库只读访问权，同时让核心组件保留完整访问权。此外，由于拦截只影响调用依赖的方式，并不影响依赖是否得到满足，所以可以在运行时安装、重新配置或移除拦截，而不会触发任何重新加载，也不会扰动依赖图。

**对不受信任组件进行沙箱化。** 当组件代码不可信时，语言层的访问控制并不足够，因为能够访问宿主运行时的恶意组件可以直接接触底层对象，使这类检查形同虚设。沙箱化需要一道语言层手段无法越过的执行边界，例如软件故障隔离 [57]、独立的语言运行时、沙箱进程或虚拟化容器 [58]。无论采用何种机制，不受信任的组件都在自己的沙箱上下文中运行，并通过桥接访问宿主提供的依赖；这是第 6.2 节跨进程调用的推广：同样的透明性论证使这种桥接访问与本地注入无法区分。在宿主一侧，该桥接是一条普通纤程，其能力可以通过上述访问控制机制加以削弱。

### 6.4. 语言无关性与语言选择

尽管 Cordis 使用 TypeScript 实现，上下文范式却与语言无关：时空可组合性仅由其两个可组合性维度来定义，因此，任何在这两个维度上都满足一定要求的语言，都可以实现这一范式。下面依次沿两个维度分析这些要求。

**时间可组合性。** 在最基本的层面上，时间可组合性要求语言支持闭包：可逆效应将一个动作与其逆配对，而这个逆必须连同它要恢复的状态一起，被捕获为一个值，以便在拆除时重放。此外，组件代码以及加载组件所产生的副作用，都必须能在运行时引入和撤回。

一种语言如何满足第二项要求，取决于它的执行模型。在托管运行时中，这表现为可由程序操作的模块注册表：已加载的模块可以从注册表中逐出，并在不再被引用后由垃圾回收器回收；例如，Node.js 就暴露了这样的注册表。<sup id="note-ref-6-1"><a href="#note-6" aria-label="注 6">6</a></sup> 原生代码不暴露模块注册表，因此，引入和撤回表现为显式的动态链接与取消链接（例如 Unix 上的 `dlopen`/`dlclose`、Windows 上的 `LoadLibrary`/`FreeLibrary`）[59]，也就是先把目标代码载入正在运行的进程，之后再将其分离。WebAssembly 采用哪种路径取决于它的嵌入器：在托管式嵌入器（例如 JavaScript 宿主）中，模块实例由宿主的垃圾回收器回收；在原生嵌入器（例如 Wasmtime）中，则在嵌入器丢弃模块实例时释放。贯穿这些机制，可逆效应模型都把加载视为作用于上下文的效应，并由相应的逆撤销模块所引入的符号、类型或处理器注册。

**空间可组合性。** 空间可组合性要求具备这样一种机制：组件能够声明其依赖，而运行时则能够提供并注入这些依赖。这可以归结为一个依赖注入（DI）问题 [38]；该问题体现在两个因语言而异的层面，即如何对依赖赋予类型，以及如何中介对依赖的访问。

在类型层面，语言应当允许开发者表达类型良好的依赖访问。消费方通过从上下文中读取键来取得余效，因此上下文类型（第 3.2.1 节）必须记录每个键的余效。类型类（Haskell）[60] 与 trait（Rust）[61] 允许提供方在其自身模块中，通过 `instance` 或 `impl` 扩展上下文类型 [62]，从而做到这一点。TypeScript 的模块扩充（module augmentation）[63] 同样允许提供方模块将声明合并到上下文类型中。

在运行时层面，对依赖的访问必须受到动态中介：随着提供方的加载与卸载，一个键背后的余效可能发生变化，而且不同上下文也可能以不同方式解析它。因此，语言需要提供一种能够透明介入访问的方式，同时保持消费方代码不变，例如 JavaScript 的 `Proxy` 对象 [64] 或 Python 的描述符协议（`__get__`）[65]。如果缺少此类原语，运行时反射 [66, 67] 也可以动态中介访问，但代价是类型安全与开发者体验的下降。

在这两个层面上，元编程设施可以同时提供类型化与中介能力。注解 [68] 和装饰器为声明附加元数据，再由处理器将其展开为中介访问的访问器；编译期元编程（例如 Rust 过程宏、Scala 宏 [69]、Zig `comptime`）则会为每项依赖生成一份带类型的声明，以及一个这样的访问器，从而无需通用的拦截原语。


<p id="note-6" class="footnote-note"><sup>6</sup> CommonJS 通过 <code>require.cache</code> 暴露模块缓存；ES 模块没有公开的逐出 API，但仍可通过引擎内部接口对模块进行管理。 <a href="#note-ref-6-1" aria-label="返回正文注 6">↩</a></p>

### 6.5. 相互依赖与组件粒度

在反应式余效模型中，依赖环只会使环中涉及的组件永久保持非活动状态：给定两个组件 $A$ 和 $B$，如果 $A$ 需要由 $B$ 提供的键，而 $B$ 又需要由 $A$ 提供的键，那么二者的满足谓词都永远不可能为真。并发系统中的死锁取决于调度，必须在实际发生时才能检测；与之不同，这种情况仅凭依赖声明就能预测，因此运行时可以在组件加载时报告它。

在实践中，大多数表面上的相互依赖都可以通过拆分为粒度更细的组件来消除环。考虑两个组件：服务器（提供网络接口）和访问控制器（执行授权策略）。这两个组件存在双向交互：访问控制器中介到达服务器的请求，而服务器则暴露一个用于修改访问控制策略的端点。在单体设计中，两个组件会彼此依赖。然而，两个交互方向在逻辑上是相互独立的关注点。将它们拆分后会得到四个组件：`server-core`、`access-control-core`、`request-mediation`（同时依赖两个核心组件，以便对传入请求实施访问控制），以及 `policy-management`（同样依赖两个核心组件，以便通过服务器暴露策略修改能力）。通过这种方法可以消除依赖环，因为两个核心组件都不依赖对方；只有集成组件同时依赖二者。

原则上，这种拆分总是可行的，因为任何双向交互都可以分解为彼此独立的单向绑定；但它会增加组件数量：在一般情形下，给定 $n$ 个彼此交互的组件，集成组件的数量可能随 $n$ 呈二次增长，因为每一对相互交互的组件都可能需要为每个交互方向分别设置一个组件。这不会影响正确性或运行时性能（组件是轻量级的），而且更细的粒度还可能有益：用户将能够只加载自己所需的特定集成绑定，从而切实提高系统的可组合性。不过，它也可能影响开发者体验：更多组件意味着需要更多配置、更多命名，也意味着理解依赖图时会产生更高的认知开销。

缓解这种粒度成本属于工程问题，而不是理论问题。实用策略包括包捆绑（即把相关的细粒度组件组成一个可安装单元）、基于约定的接线（即自动连接名称或类型符合某种模式的组件），以及脚手架工具（即根据声明式规约生成集成组件的样板代码）。这些策略既保留了无环模型的形式化保证，又能把编写负担降低到更接近单体设计的程度。

### 6.6. 依赖类型化与版本控制

在形式化模型中，依赖链接完全依据键的同一性建立：提供键 $k$ 的组件，会满足任何在其依赖集合中声明 $k$ 的组件。类型族 $\mathcal{V}_k$ 可以保证单个编译单元内部在类型层面保持一致；但当组件彼此独立地开发和构建时，这项保证便会失效，而这在组件生态系统中十分常见。这种失效会引发两个不同的问题。

**接口漂移。** 提供方可能会在版本之间修改与 $k$ 关联的接口（添加字段、更改方法签名或改变行为契约），而根据较早接口编译的消费方仍继续声明同一个键 $k$。依赖在余效层面得到了满足（$k \in \operatorname{dom}(\sigma)$），但运行时值已不再符合消费方的预期，从而引发类型错误、找不到方法的故障，或静默的行为偏离 [70]。

**键冲突。** 两个独立开发的提供方可能使用同一个键名 $k$ 来表示完全无关的接口。由于仅凭键的同一性就会建立链接，期望使用其中一个提供方接口的消费方，会在没有任何兼容性检查的情况下接受另一个提供方的值。接口漂移中的提供方与消费方至少还有共同的演化谱系；与之不同，键冲突中预期类型与实际类型之间毫无关系，因此由此产生的故障不可预测，也很难诊断。

这两个问题都指向同一处缺口：余效模型只提供名义链接（按键名），却不提供版本化链接或结构化链接（按接口兼容性）[71]。下面讨论三种弥补方法，按与基础设施耦合程度从最高到最低、也就是从基础设施相关性最强到语言无关性最强排列。

**键命名空间化。** 将键空间从 $K$ 扩展为 $K \times P$，其中 $P$ 标识定义接口的包，便可从构造上消除键冲突：独立开发、局部名称相同的接口将占据不同的键。这是最直接的解决方案，但也是耦合最紧密的方案：它把包命名空间嵌入形式化模型本身，使系统的键标识依赖外部包注册表。

**对等依赖。** 一种耦合较弱的做法，是通过宿主语言的包管理器声明版本约束 [72]。Cordis 目前采用的正是这种方法。组件依赖在语义上属于对等依赖：组件不会把自己的依赖捆绑在内部，而是期望运行时上下文提供这些依赖。支持对等依赖的包管理器（例如 npm）能够强制执行版本兼容性：如果提供某个键的包版本落在消费方声明的对等版本范围之外，那么这种不兼容会在安装时被发现，而不会以运行时故障的形式暴露。不过，这种方法有两个局限：（1）它依赖提供方忠实遵守语义化版本规范，而这只是一项无法强制执行的约定；（2）包管理器通常会把每项依赖解析为单一版本，因此无法在一个应用内加载同一个包的多个版本所提供的组件。

**结构兼容性。** 一种完全与语言无关的方法，是用兼容性谓词取代成员关系检查 $k \in \operatorname{dom}(\sigma)$；该谓词验证提供方的实际接口在结构上是否涵盖消费方的预期。这类似于结构子类型 [73]：如果所提供的接口是所需接口的子类型，那么提供方便满足消费方。难点在于如何以语言无关的方式定义这个谓词：对于记录类型，结构兼容性很直接（宽度子类型），但对于行为契约（例如前置条件/后置条件 [74]、效应规约 [22]）就会变得复杂；而一旦参数多态引入有界量化，这个问题便不可判定 [75]。

这三种方法处理的是问题的不同侧面。如何设计一种统一的依赖模型，把这些方法结合起来，同时保留余效模型对动态组合的保证，仍是一个开放问题。

### 6.7. 与语言及操作系统的协同设计

第 6.4 节指出了宿主语言为支持上下文范式至少必须提供什么。本节讨论反过来的问题：与该范式协同设计的语言或操作系统，能在这些最低要求之外提供什么。

**与语言协同设计。** 围绕上下文范式设计的语言，可以在两个方面超越库：一是它赋予上下文的语义，二是它为效应与余效提供的原语。

这样的语言可以重新让上下文变为隐式，同时保留第 3.3 节的上下文语义。命令式语言已经让每条语句都针对一个隐式上下文运行，但这个唯一的上下文既不追踪效应，也不解析余效。上下文范式则区分多个上下文；一个操作要么修改它所针对的上下文，要么从中派生另一个上下文（定义 27）。原地实现会修改环境上下文，与命令式语言的做法相同。派生式实现则会引入一个独立的上下文，语言必须为此提供一种构造。让上下文变为隐式，既能改善易用性，也能提高安全性。（1）在库式实现中，每个涉及效应或余效的函数，都要像第 5.1 节那样，把上下文作为普通参数或接收者。若由语言隐式提供上下文，函数就不再需要接收它。（2）每个上下文都有自己的生命周期状态和已提交视图（第 4.1 节）。库式实现把上下文作为普通变量传递，因此组件可能通过闭包或全局变量，错误地访问另一个组件的上下文。它安装在那个上下文中的效应随后会泄漏到自身生命周期之外，而从中读取的余效也会逃逸出自身的依赖规约。让上下文变为隐式，可以同时杜绝这两种情况。

这样的语言还可以让编译器感知效应与余效。（1）对于效应，效应迭代器（定义 51）会在每一步都分配一个闭包，把逆与该逆要恢复的状态保存在一起。如果语言提供执行效应的专用语法，编译器就能为整个迭代生成一个状态机，并将这些逆保存在状态机的帧中。（2）对于余效，可以把余效规约纳入类型系统，从而带来两项好处。第一，依赖环可以在编译时报告，而不必留到运行时处理（第 6.5 节）。第二，可以按照依赖类型的结构比较依赖，而不再仅按键的同一性比较，就像行类型所做的那样 [28]；这为第 6.6 节的结构兼容性提供了类型层支持。

**与操作系统协同设计。** 第 1.2.3 节指出了一种动态可组合性的粗粒度替代方案：操作系统以进程为粒度提供时间可组合性，其上的容器编排器则以服务为粒度提供空间可组合性。与该范式协同设计的操作系统将通过两种方式支持细粒度组合：让组件声明的余效规约涵盖它所能访问的一切，并把操作系统自身的资源作为余效提供。

这样的操作系统可以提供第 6.3 节留给语言外部机制实现的沙箱。其做法是把组件能够访问的范围限制在它所声明的依赖之内：加载组件时向它提供这些依赖，而在组件内部不留下任何其他可达对象；这就像 WebAssembly 模块在实例化时从嵌入器接收其导入项一样 [76]。它还可以将第 3.2.3 节的余效隔离与拦截作为操作系统自身的能力，为每个组件以不同方式绑定同一个键，并中介它所提供的访问。

这样的操作系统还可以把自身资源作为余效提供。如果运行时把每次资源获取都记录到发起获取的组件名下，那么原本位于边界之外的资源便可变得可逆（第 6.1 节）；每个运行时都会维护一份自己的记录。当操作系统把资源作为余效提供时，只需维护一份这样的记录，因为资源正是由它发放的，它也能够将资源归因于提出请求的组件。内存和文件描述符是最直接的候选对象，而为恢复目的在内核接口处追踪这些资源，已有先例 [77, 78]。此外，对于第 6.1 节认为只能暂缓或补偿的某些操作，操作系统也可以使其变为可逆。以事务方式向持久存储执行写入的系统可以回滚这次写入 [79]；构建在写时复制存储或不可变存储之上的系统，则可以通过移动指针返回先前状态 [80, 81]。

## 7. 相关工作

动态可组合性与若干成熟研究领域相交。本节考察其中最相关的几条研究脉络，并逐一说明我们的贡献与它们之间的区别。

### 7.1. 效应与余效系统

第 2 节回顾了效应与余效，它们是本研究所依托的理论支柱。我们首先说明如今已广泛应用于工业实践的单子效应系统与本研究之间的关系，随后考察三条沿着与 Cordis 相关的方向扩展效应和余效的研究路线：将代数效应重新解释为能力、为效应赋予可逆语义，以及在统一的分级规约下统一效应与余效。

**单子效应系统。** 有一类库在现有通用语言的类型系统中编码效应，将其表示为由运行时执行的单子值。Scala 中的 ZIO [82] 将计算建模为 `ZIO[R,E,A]`，TypeScript 中的 Effect-TS [83] 则将其建模为 `Effect<A,E,R>`；这些泛型类型的参数描述计算结果、类型化错误，以及其上下文必须提供的服务。fp-ts 库 [84] 通过基于 Reader 的单子变换器编码相同的错误通道与要求通道。这些系统与 Cordis 有两个不同之处。第一，追踪能力以单子嵌入为代价：程序必须写在效应类型内部，才能获得这种能力；Cordis 则将效应追踪作为覆盖在普通宿主代码之上的一层机制。第二，一项要求通过解释来消解，即由已安装的服务提供相应操作；当该服务被撤回时，其操作已经产生的结果仍会留在原处。Cordis 则为每个效应配对一个逆函数，并随着提供者的加入和离开重新解析要求（第 3.1 节、第 3.2 节）。

**作为能力的代数效应。** 代数效应（第 2.1 节）使效应操作对类型系统可见。与本研究最接近的扩展是 Brachthäuser 等人的 Effekt 语言；它将效应类型重新解释为能力 [85, 86]：一个效应类型表达的是计算需要从上下文获得什么，而不是它可能产生哪些副作用。与我们的观点相同，这一视角也把上下文视为能力的中介。Cordis 与 Effekt 在两个方面有所不同。(1) 就目的而言，代数效应使效应可见，是为了支持模块化解释，让同一操作可以具有多种处理器语义；Cordis 使效应可见，则是为了支持追踪与还原，为每个上下文变换配对一个逆变换。(2) 就应用环境而言，Effekt 在类型层面静态约束效应，默认采用基于作用域的推理：能力是二等值并受限于其词法作用域；它又通过装箱恢复一等用法，即在类型中追踪被捕获的能力，从而解除这一限制。Cordis 则在运行时约束效应，目标是在移除组件时完整回收资源；第 6.7 节讨论了让上下文在这一意义上成为二等值的语言能够提供什么。

**可逆效应语义。** 另一条平行的研究路线为效应赋予可逆语义，而非解释语义。Heunen 等人 [87] 对 Hughes 的箭头加以改造，引入 dagger 箭头与逆箭头，从而在可逆环境中对副作用建模，并捕获序列化、可变存储等其操作具有逆操作的效应。这是与我们的可逆效应最接近的形式化描述：两种方法都为每个效应配备撤销它的手段，而不是通过处理器消解效应。二者的区别在于可逆性位于何处，以及对可逆性的要求有多强。Heunen 等人在指称式的范畴论环境中展开研究；其中，可逆性是一项全局性质，由构造保证，因为每个计算都可逆，而且双侧逆可从范畴结构中恢复出来。Cordis 在运行时追踪逆函数，并且要求更弱：它不要求整个计算可逆，只要求每个原子效应具有单侧逆；该逆函数不是推导出来的，而是由调用者在应用效应时提供，随后可通过组合得到任意复合效应的逆函数（第 3.1 节）。

**以分级类型统一效应与余效。** Orchard 等人 [88] 提出将分级模态类型作为同时涵盖效应推理（通过分级单子）与余效推理（通过分级余单子）的统摄性概念，并在 Granule 语言中实现了这一思想，从而证明同一个类型系统可以同时追踪计算做了什么以及它需要什么。较新的研究还将余效扩展到类似 Java 的命令式语言 [89, 90] 和按值压栈（call-by-push-value）[91]。这些工作全都作用于类型层面：效应与余效是静态标注，在编译时针对词法上固定的作用域进行检查。我们的贡献与这种分析正交：我们将相同的两个概念提升为运行时机制，使 Cordis 能够处理动态组合。随着已加载组件的集合不断演化，时间维度上的撤回与空间维度上的依赖会被重新解析，而不是基于固定的程序文本一次性确定。

### 7.2. 编程范式

第 3.3.3 节将上下文范式确立为一种通过显式上下文来中介效应与余效的编程规约。有两种成熟范式值得明确比较：一种与我们共享“上下文”这一术语，另一种则与我们对横切关注点的处理方式相近。

**面向上下文编程。** 面向上下文编程（context-oriented programming，COP）[92, 93] 为语言配备了层（layer）——可以根据执行上下文在运行时激活和停用的局部方法定义与类定义，因此行为能够自适应变化，而基础代码无须指明自身的上下文依赖 [94]。COP 与 Cordis 都将上下文视为一等的、可在运行时改变的实体，也都会动态激活和停用行为；不过，这种相似仅停留在名称层面。在 COP 中，“上下文”指周围的执行情境（例如位置、用户或模式），激活操作会在一个动态作用域范围内改变方法分派；层既不追踪其引发的副作用，也不还原这些副作用，而且激活与否并不取决于依赖是否得到满足。在 Cordis 中，上下文是中介效应与余效的 $Γ^∞$ 实体：激活会运行组件的可逆效应，并由反应式余效的满足情况驱动（第 3.2 节）；停用则会完整还原这些效应。COP 改变的是运行哪种行为；Cordis 组合并还原的，则是组件所安装的效应与依赖。二者之间的差异体现了一项权衡。COP 将激活融入宿主语言的方法分派，以语言特定性为代价获得动态作用域的层范围；Cordis 作为一层与语言无关的覆盖机制，则在共享上下文上以反应式方式解析激活。因此，Cordis 能以余效表达的仅是 COP 中全局的、由值驱动的那部分，即根据上下文在不同实现之间进行选择，而无法表达动态作用域的激活。

**面向切面编程。** 面向切面编程（aspect-oriented programming，AOP）[95, 96] 将横切关注点模块化为切面：切点对基础程序中选出的连接点进行量化，通知则被织入每一个这样的连接点。Cordis 处理的是同一个问题，即原本会散布在多个组件中的上下文相关行为；但在 Cordis 中，与切面对应的是余效：它是许多组件声明依赖的共享中介点，因此可以在此处重塑横切行为，而无须编辑任何组件。随后，两种范式在两个维度上表现出差异。(1) 声明与无感知：AOP 切点是无感知且经过量化的，它可以匹配任意连接点，而这些连接点处的代码并不知道自身会收到通知；Cordis 则将横切限定于各组件声明的余效，因此其作用范围恰好就是声明所覆盖的表面。这带来了确定性与可追踪性：应用编排器无须阅读或分析组件源码，就能在配置层检查并管控哪些内容会横切该组件；相比之下，AOP 中的关注点只能通过对它进行量化的切面来理解。(2) 生命周期集成：在 Cordis 中，一项横切变更由组件的效应承载，在组件卸载时得到还原，并以反应式方式传播给其依赖方，因此它只是动态组合模型中的一个动作；动态 AOP 系统 [97, 98] 同样可以在运行时织入和解除织入，但这是一项独立操作，既不绑定到组件生命周期，也不会触发被通知代码之间的重新解析。

### 7.3. 时间可组合性

时间可组合性关注的是：如何在运行中的程序里替换或移除组件，同时恢复该组件所安装的效应。既有方法可以根据其如何处理离开组件的状态与效应分为四类：将状态向前迁移到后继版本；通过开发者编写的清理逻辑恢复效应；在预先固定的作用域内自动逆转效应；或者由运行时在某个接口上实施中介并积累记录，再依据该记录回收资源。

**有状态的向前迁移。** 一大类系统通过跨版本向前迁移状态，在不中断服务的情况下替换运行中程序的组件。它们都遵循同一项时序规约：只有当组件到达一个安全且无交互的时点后，才能替换该组件。Kramer 和 Magee 将这一判据确立为静止性（quiescence）[51]，Vandewoude 等人随后将其放宽为干扰更小的平静性（tranquility）[52]；我们的滚动更新模式（第 6.2 节）会在卸载提供者前排空进行中的请求，从而执行这一判据。动态软件更新（dynamic software updating，DSU）随后通过手写的变换函数向前迁移状态：Hicks 等人面向 C 语言的通用 DSU [99]、Stoyle 等人借助 con-freeness 分析得到的类型安全更新点 [100]，以及 Hayden 等人的 Kitsune [101]，都会将旧版本数据映射为新版本的表示形式，在原处继承堆对象、已打开文件和连接，同时重新初始化所有未被迁移的内容。同样的规约也可扩展到持久状态：Overeem 等人 [102] 使用手写的升级操作，在保持系统可用的同时，在不同 schema 版本之间转换运行中事件存储的数据。Erlang/OTP [15] 在进程层面采取同一立场：通过 `code_change/3` 迁移状态，并通过重启受监督进程从故障中恢复，而不是还原这些进程的效应。JavaScript 的热模块替换（例如 webpack [46]、Vite [47]）则在模块层面采用相同做法，在重新加载期间通过 `module.hot` 或 `import.meta.hot` API 将状态向前传递。与 Cordis 的模块替换（第 5.2 节）相比，这些方法能够更平滑地迁移内存中状态：Cordis 会还原旧组件受追踪的效应，再从干净状态重新应用新组件的效应，因此组件自身的内存中状态无法跨越重新加载而保留，除非将其放入生命周期更长的依赖中；在可逆效应之上叠加 DSU 式向前迁移，仍是未来工作。尽管如此，Cordis 的方法在两个方面更加通用：它不需要 DSU 和 HMR 所要求的手写迁移函数；它还支持彻底卸载组件并回收其资源，而不只是就地更新组件。

**由开发者编写的恢复。** 第二类方法通过开发者手写的清理逻辑或补偿逻辑来恢复组件的效应。插件生命周期约定（例如 OSGi [50]、Eclipse 的扩展点、IntelliJ 和 VSCode）将清理工作委托给开发者编写的卸载回调；命令模式 [103] 将操作与用于撤销/重做栈的 `undo` 方法封装在一起；Saga 模型 [49] 将长期事务组织成多个步骤，每个步骤都配有一个补偿动作；代数效应处理器可以附加在拆卸时运行的终结器 [104]；事件溯源 [105] 则通过追加补偿事件来撤回状态，根本不执行逆操作。在所有这些方法中，提供逆操作都是一项不受强制约束、且与原操作相分离的职责，因此一旦遗漏，资源便会悄然泄漏（如第 1.2.1 节的实证记录所示）。React 的 `useEffect` 钩子 [106] 最接近于从结构上为效应配对其逆操作：它返回一个清理函数，由运行时在每次重新执行前以及卸载时调用。它的不足在于可组合性：钩子只能在组件或另一个钩子的顶层调用，绝不能位于条件分支、循环或嵌套函数中，而且其效应函数体既不能接受异步函数，也不能接受迭代器。因此，效应无法由其他效应组装而成，也无法与控制流交错，于是便不存在可据以推导复合逆函数的结构。Cordis 效应没有这种限制：它们是可以自由组合、也可以异步运行的普通操作；只有每个原子效应需要一个手写逆函数，任意复合效应的逆函数则由组合推导出来，因此组装已有的效应完全无须再编写逆函数。每个效应与其逆函数之间的这种结构性配对，使完整恢复成为系统的一项不变量，而不再取决于开发者能否恪守规约。

**静态定域的逆转。** 第三类方法通过构造自动逆转效应，但把逆转限定在预先固定的作用域内。软件事务内存 [107, 108] 由硬件事务内存 [109] 演化而来；它会记录读/写日志，使一组内存操作要么提交，要么中止并将内存回滚到事务开始前的状态。可逆计算从 Landauer 和 Bennett 的热力学分析 [110, 111] 一路发展到 Janus [112] 等可逆语言，更进一步地让整个计算的每一步都具有全局可逆性。可逆进程演算则把回溯内建到语义本身：RCCS [113] 为每个进程附带一份记忆，并允许在某一步所通向的过去与目标过去因果等价时撤销该步；Phillips 和 Ulidowski [114] 则为 CCS、ACP 与 CSP 统一推导出可逆算子，同时保持它们的前向操作语义。它们采用的因果一致性判据，正是 Cordis 恢复顺序在并发环境下的对应物：累加器按后进先出顺序应用组件自身的逆函数，而第 4.3.1 节的守卫会推迟提供者的撤回，直到其使用者均已停用（定理 63）。不过，这类方法的作用范围由语义固定，执行过的每个动作都始终保持可撤销；Cordis 组件则为每个原子效应提供逆函数，其累加器将上下文带回该组件开始组合时的状态。线性类型 [115]、RAII [4] 以及 Rust 的所有权系统 [61] 把资源释放绑定到词法区域。上述每种方法都静态固定了逆转的作用域与作用范围；相比之下，Cordis 不会预先固定这样的作用域：它会在组件的整个生命周期内还原任意上下文操作，并把词法资源管理视为一种互补机制，适合管理单个组件内部的局部资源。

**中介式回收。** 第四类方法无须组件自身提供逆函数，而是通过运行时所控制的接口记录组件获取的内容，并据此实施回收。Nooks [77] 包装了跨越 Linux 内核与其可加载扩展之间边界的每一次调用，因此扩展所接触的内核对象都会经过对象追踪器；扩展发生故障时，该追踪器的记录会告诉恢复管理器应当释放哪些对象。影子驱动程序（shadow driver）[78] 从另一侧接入同一组调用，记录决定驱动程序状态的请求与配置，从而可以让重启后的实例恢复到该状态。Akeso [116] 则通过编译器插桩获得记录：它将内核执行划分为可嵌套的恢复域，记录各恢复域的状态变化与跨线程依赖，并将发生故障的请求连同依赖于该请求的每个恢复域一起回滚。因此，回收源自运行时维护的记录，而非开发者记得编写的清理逻辑；这使该类方法成为可逆效应在系统层面最接近的先例。它与 Cordis 的区别在于所用词汇与作用范围。平台固定了哪些内容可以被记录——无论其形式是针对每类内核对象的释放代码、每类驱动程序对应的一个影子，还是每个经过插桩的分配器对应的一个逆函数——因此，组件只能持有平台已经知道如何释放的资源；Cordis 组件则可以引入自己的效应，并为每个原子效应提供逆函数（第 3.1 节）。同样，回收的边界是某个会提交的请求，或同一扩展的一次重启；Cordis 则在组件的整个生命周期上进行还原，并将移除传播给组件的依赖方，后者继而释放自身的效应（第 3.2 节）。

### 7.4. 空间可组合性

空间可组合性关注如何声明组件对其他组件的依赖，以及如何绑定这些依赖。既有机制可以根据绑定如何响应变化分为三类：仅在初始化时连接依赖；对整个组件的可用性作出反应；或者以单个值为粒度传播变化。

**初始化时的依赖连接。** 有两种成熟机制会在初始化时把组件连接起来。依赖注入框架 [38]（例如 Spring [117]、Guice、Angular、Inversify）会在初始化组件时向其中注入依赖，而 UI 框架的上下文（例如 Vue.js 的 `provide`/`inject` 与 React 的 Context API）则沿组件树传递依赖。其中一些机制支持动态作用域（例如 Spring 的 prototype/request 作用域、Angular 的分层注入器），但二者都不会以反应式方式重新解析：在运行时替换或移除提供者时，已有的依赖方既不会被停用，也不会被重新初始化；而且，它们都不提供类似于我们的组件状态机的生命周期管理。Cordis 的反应式余效（第 3.2 节）提供了这种能力：每当满足谓词发生变化，通知机制都会触发生命周期迁移。

**对可用性作出反应的组件模型。** 与我们的反应式余效最接近的先例会对服务可用性作出反应。OSGi 的 Declarative Services 与 iPOJO [118, 119] 允许组件声明其提供和需要的服务；随着服务出现和消失，运行时会自动激活和停用这些组件。iPOJO 的 Gravity 项目 [119] 明确以根据服务可用性的变化进行自主运行时适应为目标，而它的 `provide`/`require` 模型直接预示了 Cordis 的 `ctx.provide`/`ctx.get` 模式。R-OSGi [53] 通过 RPC 将同一个抽象透明地扩展到分布式环境，把网络故障映射为服务撤回事件；第 6.2 节将这一模式作为 Cordis 模型的一项扩展加以讨论。所有这些系统都通过停用回调进行恢复，而这种做法存在两个限制。第一，回调由开发者手写，因此资源安全取决于开发者的自律，任何被遗漏的回调都会导致资源悄然泄漏。第二，回调是同步的：如果拆卸需要与即将离开的依赖进行一次异步交互，这些框架并不提供等待该交互的协议，只能迫使程序针对一个可能已经陈旧的引用进行阻塞等待。Cordis 的反应式余效弥补了这两处缺口：停用会还原依赖方所累积的效应，而其具有惯性的 $𝖴𝗇𝗅𝗈𝖺𝖽𝗂𝗇𝗀$ 状态（第 4.3.3 节）会让异步拆卸运行至完成，之后才响应进一步的变化。

**值级反应性。** 函数式反应式编程（functional reactive programming，FRP）[120] 及其现代实现（例如 SolidJS 中的 signal [121, 122]、Vue 的反应式系统、Angular Signals）以值级粒度传播变化：当一个 signal 发生变化时，派生计算会同步重新求值，或在调度器控制下重新求值 [123]。Cordis 的反应式余效则作用于组件级粒度，并额外加入值级传播所不建模的异步生命周期语义。在一致性方面，同一项粒度差异又呈现出相反的优势：FRP 在一个轮次（turn）内，依照依赖图确定的顺序传播变化，因此可以要求任何派生计算都不会同时读到已更新输入与陈旧输入的混合；这就是无毛刺性（glitch freedom）[124]。Cordis 没有与轮次对应的概念，编排动作会逐个到来；它只保证任何一次迁移都不会横跨两次不同的余效解析（定理 64）。两者互为补充，而非相互竞争：Cordis 余效本身可以携带反应式值，而组件只根据自己实际使用的部分进行更新，由此将组件级反应性细化为跨越两个层级的、更细粒度的反应式余效。

## 8. 结论

我们通过将经典的效应与余效概念提升为运行时机制，为动态可组合性提出了一个形式化基础。可逆效应解决了局部时间可组合性：每个上下文变换都携带一个由运行时追踪的逆变换，而且追踪与恢复均保持组合，因此在移除组件时能够恢复上下文。反应式余效解决了局部空间可组合性：每当上下文发生变化时，都会依据组件的余效规约向该组件发出通知，并将每次变化分类为激活型、停用型或中性；余效隔离会改变声明键的解析结果，而余效拦截会改变绑定的使用方式。我们将效应上下文与余效上下文统一为单一的上下文类型，其中，余效上的观察等价关系为效应赋予独立性，由此构成一种面向时空可组合性的编程范式。随后，将这些机制结合到组件这一概念中，便得到一种动态组合演算；其元理论将时空可组合性从单个组件推广到由交错运行的组件组成的整个系统。我们将这一范式实现为 Cordis 元框架，其中既有提供效应追踪与余效解析的核心库，也有支持配置协调与热模块替换（HMR）的声明式组件加载器。Koishi 案例研究在一个拥有 4000 多个社区插件的生产系统中验证了 Cordis 的设计。

除由人工维护的插件生态系统之外，一个值得进一步验证的方向是自演化智能体运行框架（第 1.2.2 节）：在这类框架中，AI 智能体会持续生成并替换自身的运行框架组件，且只有很少的人工监督。将 Cordis 应用于这样的环境，既能验证在组件快速替换时实现完整恢复的时间保证，也能验证在拓扑频繁变化时实现依赖协调的空间保证。这种验证将表明，该范式能够作为一种基础，用于在智能体运行框架及其他自主系统中实现可恢复、协调且持续的自我演化。

## 参考文献

[1] D. L. Parnas, “On the criteria to be used in decomposing systems into modules,” Communications of the ACM, vol. 15, no. 12, pp. 1053–1058, 1972, doi: 10.1145/361598.361623.

[2] D. Birsan, “On Plug-ins and Extensible Architectures,” ACM Queue, vol. 3, no. 2, pp. 40–46, 2005, doi: 10.1145/1053331.1053345.

[3] B. Burns, B. Grant, D. Oppenheimer, E. Brewer, and J. Wilkes, “Borg, Omega, and Kubernetes,” Communications of the ACM, vol. 59, no. 5, pp. 50–57, 2016, doi: 10.1145/2890784.

[4] B. Stroustrup, The Design and Evolution of C++. Addison-Wesley, 1994.

[5] S. Marlow, S. Peyton Jones, A. Moran, and J. Reppy, “Asynchronous Exceptions in Haskell,” in Proceedings of the ACM SIGPLAN 2001 Conference on Programming Language Design and Implementation, in PLDI '01. New York, NY, USA: Association for Computing Machinery, 2001, pp. 274–285. doi: 10.1145/378795.378858.

[6] L. Cardelli, “Program Fragments, Linking, and Modularization,” in Proceedings of the 24th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL 1997), ACM Press, 1997, pp. 266–277. doi: 10.1145/263699.263735.

[7] C. Szyperski, Component Software: Beyond Object-Oriented Programming, 2nd ed. Addison-Wesley, 2002.

[8] R. Lopopolo, “Harness Engineering: Leveraging Codex in an Agent-First World.” [Online]. Available: https://openai.com/index/harness-engineering/

[9] Anthropic, “Harness Design for Long-Running Application Development.” [Online]. Available: https://www.anthropic.com/engineering/harness-design-long-running-apps

[10] L. Wang et al., “A Survey on Large Language Model Based Autonomous Agents,” Frontiers of Computer Science, vol. 18, no. 6, p. 186345, 2024, doi: 10.1007/s11704-024-40231-1.

[11] Y. Qin et al., “Tool Learning with Foundation Models,” ACM Computing Surveys, 2025, doi: 10.1145/3704435.

[12] C. Packer, V. Fang, S. G. Patil, K. Lin, S. Wooders, and J. E. Gonzalez, “MemGPT: Towards LLMs as Operating Systems,” CoRR, vol. abs/2310.08560, 2023.

[13] T. Guo et al., “Large Language Model Based Multi-Agents: A Survey of Progress and Challenges,” in Proceedings of the Thirty-Third International Joint Conference on Artificial Intelligence, in IJCAI 2024. 2024, pp. 8048–8057. doi: 10.24963/ijcai.2024/890.

[14] T. Cai, X. Wang, T. Ma, X. Chen, and D. Zhou, “Large Language Models as Tool Makers,” in Proceedings of the Twelfth International Conference on Learning Representations, in ICLR 2024. [Online]. Available: https://openreview.net/forum?id=qV83K9d5WB

[15] J. Armstrong, “Making Reliable Distributed Systems in the Presence of Software Errors,” Doctoral dissertation, 2003. [Online]. Available: https://erlang.org/download/armstrong_thesis_2003.pdf

[16] E. Moggi, “Notions of computation and monads,” Information and Computation, vol. 93, no. 1, pp. 55–92, 1991, doi: 10.1016/0890-5401(91)90052-4.

[17] G. Plotkin and J. Power, “Adequacy for Algebraic Effects,” in Foundations of Software Science and Computation Structures, F. Honsell and M. Miculan, Eds., Berlin, Heidelberg: Springer Berlin Heidelberg, 2001, pp. 1–24.

[18] T. Petricek, D. Orchard, and A. Mycroft, “Coeffects: unified static analysis of context-dependence,” in Proceedings of the 40th International Conference on Automata, Languages, and Programming - Volume Part II, in ICALP'13. Riga, Latvia: Springer-Verlag, 2013, pp. 385–397. doi: 10.1007/978-3-642-39212-2_35.

[19] M. Gaboardi, S.-ya Katsumata, D. Orchard, F. Breuvart, and T. Uustalu, “Combining effects and coeffects via grading,” in Proceedings of the 21st ACM SIGPLAN International Conference on Functional Programming, in ICFP 2016. Nara, Japan: Association for Computing Machinery, 2016, pp. 476–489. doi: 10.1145/2951913.2951939.

[20] A. Church, “A Formulation of the Simple Theory of Types,” The Journal of Symbolic Logic, vol. 5, no. 2, pp. 56–68, 1940, doi: 10.2307/2266170.

[21] B. C. Pierce, Types and Programming Languages. MIT Press, 2002.

[22] J. M. Lucassen and D. K. Gifford, “Polymorphic Effect Systems,” in Proceedings of the 15th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '88. San Diego, California, USA: Association for Computing Machinery, 1988, pp. 47–57. doi: 10.1145/73560.73564.

[23] P. Wadler, “Monads for functional programming,” in Program Design Calculi, M. Broy, Ed., Berlin, Heidelberg: Springer Berlin Heidelberg, 1993, pp. 233–264.

[24] G. Plotkin and J. Power, “Notions of Computation Determine Monads,” in Foundations of Software Science and Computation Structures, Berlin, Heidelberg: Springer Berlin Heidelberg, 2002, pp. 342–356. doi: 10.1007/3-540-45931-6_24.

[25] G. Plotkin and M. Pretnar, “Handlers of Algebraic Effects,” in Programming Languages and Systems (ESOP), Berlin, Heidelberg: Springer Berlin Heidelberg, 2009, pp. 80–94. doi: 10.1007/978-3-642-00590-9_7.

[26] M. Pretnar, “An Introduction to Algebraic Effects and Handlers. Invited tutorial paper,” Electron. Notes Theor. Comput. Sci., vol. 319, no. C, pp. 19–35, Dec. 2015, doi: 10.1016/j.entcs.2015.12.003.

[27] D. Leijen, “Koka: Programming with Row Polymorphic Effect Types,” Electronic Proceedings in Theoretical Computer Science, vol. 153, pp. 100–126, Jun. 2014, doi: 10.4204/eptcs.153.8.

[28] D. Leijen, “Type directed compilation of row-typed algebraic effects,” in Proceedings of the 44th ACM SIGPLAN Symposium on Principles of Programming Languages, in POPL '17. Paris, France: Association for Computing Machinery, 2017, pp. 486–499. doi: 10.1145/3009837.3009872.

[29] A. Bauer and M. Pretnar, “Programming with algebraic effects and handlers,” Journal of Logical and Algebraic Methods in Programming, vol. 84, no. 1, pp. 108–123, Jan. 2015, doi: 10.1016/j.jlamp.2014.02.001.

[30] K. Sivaramakrishnan et al., “Retrofitting parallelism onto OCaml,” Proc. ACM Program. Lang., vol. 4, no. ICFP, Aug. 2020, doi: 10.1145/3408995.

[31] T. Petricek, D. Orchard, and A. Mycroft, “Coeffects: a calculus of context-dependent computation,” in Proceedings of the 19th ACM SIGPLAN International Conference on Functional Programming, in ICFP '14. Gothenburg, Sweden: Association for Computing Machinery, 2014, pp. 123–135. doi: 10.1145/2628136.2628160.

[32] T. Uustalu and V. Vene, “Comonadic Notions of Computation,” Electronic Notes in Theoretical Computer Science, vol. 203, no. 5, pp. 263–284, 2008, doi: 10.1016/j.entcs.2008.05.029.

[33] A. Brunel, M. Gaboardi, D. Mazza, and S. Zdancewic, “A Core Quantitative Coeffect Calculus,” in Proceedings of the 23rd European Symposium on Programming Languages and Systems - Volume 8410, Berlin, Heidelberg: Springer-Verlag, 2014, pp. 351–370. doi: 10.1007/978-3-642-54833-8_19.

[34] J. Reed and B. C. Pierce, “Distance makes the types grow stronger: a calculus for differential privacy,” SIGPLAN Not., vol. 45, no. 9, pp. 157–168, Sep. 2010, doi: 10.1145/1932681.1863568.

[35] M. Abadi, A. Banerjee, N. Heintze, and J. G. Riecke, “A core calculus of dependency,” in Proceedings of the 26th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '99. San Antonio, Texas, USA: Association for Computing Machinery, 1999, pp. 147–160. doi: 10.1145/292540.292555.

[36] D. E. Denning, “A lattice model of secure information flow,” Commun. ACM, vol. 19, no. 5, pp. 236–243, May 1976, doi: 10.1145/360051.360056.

[37] U. Dal Lago and F. Gavazzo, “A relational theory of effects and coeffects,” Proc. ACM Program. Lang., vol. 6, no. POPL, Jan. 2022, doi: 10.1145/3498692.

[38] M. Fowler, “Inversion of Control Containers and the Dependency Injection pattern.” [Online]. Available: https://martinfowler.com/articles/injection.html

[39] A. M. Pitts and I. D. B. Stark, “Observable Properties of Higher Order Functions that Dynamically Create Local Names, or What's New?,” in Mathematical Foundations of Computer Science 1993 (MFCS 1993), in Lecture Notes in Computer Science, vol. 711. Springer, 1993, pp. 122–141. doi: 10.1007/3-540-57182-5\_8.

[40] G. D. Plotkin, “LCF Considered as a Programming Language,” Theoretical Computer Science, vol. 5, no. 3, pp. 223–255, 1977, doi: 10.1016/0304-3975(77)90044-5.

[41] D. R. Ghica, K. Muroya, and T. Waugh Ambridge, “A Robust Graph-Based Approach to Observational Equivalence,” Logical Methods in Computer Science, vol. 21, no. 2, p. 8:1–8:95, 2025, doi: 10.46298/LMCS-21(2:8)2025.

[42] X. Leroy and S. Blazy, “Formal Verification of a C-like Memory Model and Its Uses for Verifying Program Transformations,” Journal of Automated Reasoning, vol. 41, no. 1, pp. 1–31, 2008, doi: 10.1007/s10817-008-9099-0.

[43] R. P. James and A. Sabry, “Yield: Mainstream Delimited Continuations,” in First International Workshop on the Theory and Practice of Delimited Continuations (TPDC 2011), 2011, pp. 20–32. [Online]. Available: https://homes.luddy.indiana.edu/sabry/files/yield.pdf

[44] A. W. Mazurkiewicz, “Trace Theory,” in Petri Nets: Central Models and Their Properties, Advances in Petri Nets 1986, Part II, in Lecture Notes in Computer Science, vol. 255. Springer, 1986, pp. 279–324. doi: 10.1007/3-540-17906-2_30.

[45] U. A. Acar, G. E. Blelloch, and R. Harper, “Adaptive functional programming,” ACM Transactions on Programming Languages and Systems, vol. 28, no. 6, pp. 990–1034, 2006, doi: 10.1145/1186632.1186634.

[46] webpack, “Hot Module Replacement.” [Online]. Available: https://webpack.js.org/api/hot-module-replacement/

[47] Vite, “HMR API.” [Online]. Available: https://vite.dev/guide/api-hmr

[48] E. N. Elnozahy, L. Alvisi, Y.-M. Wang, and D. B. Johnson, “A Survey of Rollback-Recovery Protocols in Message-Passing Systems,” ACM Computing Surveys, vol. 34, no. 3, pp. 375–408, 2002, doi: 10.1145/568522.568525.

[49] H. Garcia-Molina and K. Salem, “Sagas,” in Proceedings of the 1987 ACM SIGMOD International Conference on Management of Data, in SIGMOD '87. 1987, pp. 249–259. doi: 10.1145/38713.38742.

[50] OSGi Alliance, OSGi Core Release 8. OSGi Alliance, 2020. [Online]. Available: https://docs.osgi.org/specification/osgi.core/8.0.0/

[51] J. Kramer and J. Magee, “The Evolving Philosophers Problem: Dynamic Change Management,” IEEE Transactions on Software Engineering, vol. 16, no. 11, pp. 1293–1306, 1990, doi: 10.1109/32.60317.

[52] Y. Vandewoude, P. Ebraert, Y. Berbers, and T. D'Hondt, “Tranquility: A Low Disruptive Alternative to Quiescence for Ensuring Safe Dynamic Updates,” IEEE Transactions on Software Engineering, vol. 33, no. 12, pp. 856–868, 2007, doi: 10.1109/tse.2007.70733.

[53] J. S. Rellermeyer, G. Alonso, and T. Roscoe, “R-OSGi: Distributed Applications Through Software Modularization,” in Proceedings of the ACM/IFIP/USENIX 8th International Middleware Conference, in Middleware '07. 2007, pp. 1–20. doi: 10.1007/978-3-540-76778-7_1.

[54] J. B. Dennis and E. C. Van Horn, “Programming Semantics for Multiprogrammed Computations,” Communications of the ACM, vol. 9, no. 3, pp. 143–155, 1966, doi: 10.1145/365230.365252.

[55] M. S. Miller, K.-P. Yee, and J. Shapiro, “Capability Myths Demolished,” technical report SRL2003–2, 2003. [Online]. Available: http://zesty.ca/capmyths/usenix.pdf

[56] R. N. M. Watson, J. Anderson, B. Laurie, and K. Kennaway, “Capsicum: Practical Capabilities for UNIX,” in Proceedings of the 19th USENIX Security Symposium, 2010, pp. 29–46. [Online]. Available: https://www.usenix.org/legacy/events/sec10/tech/full_papers/Watson.pdf

[57] R. Wahbe, S. Lucco, T. E. Anderson, and S. L. Graham, “Efficient Software-Based Fault Isolation,” in Proceedings of the 14th ACM Symposium on Operating Systems Principles, in SOSP '93. 1993, pp. 203–216. doi: 10.1145/168619.168635.

[58] A. Barth, A. P. Felt, P. Saxena, and A. Boodman, “Protecting Browsers from Extension Vulnerabilities,” in Proceedings of the 17th Annual Network and Distributed System Security Symposium, in NDSS '10. 2010. [Online]. Available: https://www.ndss-symposium.org/ndss2010/protecting-browsers-extension-vulnerabilities/

[59] W. W. Ho and R. A. Olsson, “An Approach to Genuine Dynamic Linking,” Software: Practice and Experience, vol. 21, no. 4, pp. 375–390, 1991, doi: 10.1002/SPE.4380210404.

[60] P. Wadler and S. Blott, “How to Make Ad-hoc Polymorphism Less Ad Hoc,” in Proceedings of the 16th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '89. 1989, pp. 60–76. doi: 10.1145/75277.75283.

[61] N. D. Matsakis and F. S. K. II, “The Rust Language and Type System,” in ACM SIGPLAN ML Family Workshop, Gothenburg, Sweden, Sep. 2014.

[62] D. Dreyer, R. Harper, M. M. T. Chakravarty, and G. Keller, “Modular Type Classes,” in Proceedings of the 34th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '07. 2007, pp. 63–70. doi: 10.1145/1190216.1190229.

[63] Microsoft, “Declaration Merging.” [Online]. Available: https://www.typescriptlang.org/docs/handbook/declaration-merging.html

[64] T. Van Cutsem and M. S. Miller, “Proxies: Design Principles for Robust Object-oriented Intercession APIs,” in Proceedings of the 6th Symposium on Dynamic Languages, in DLS '10. 2010, pp. 59–72. doi: 10.1145/1869631.1869638.

[65] R. Hettinger, “Descriptor HowTo Guide.” [Online]. Available: https://docs.python.org/3/howto/descriptor.html

[66] P. Maes, “Concepts and Experiments in Computational Reflection,” in Conference on Object-Oriented Programming Systems, Languages, and Applications (OOPSLA), 1987, pp. 147–155. doi: 10.1145/38765.38821.

[67] G. Bracha and D. M. Ungar, “Mirrors: design principles for meta-level facilities of object-oriented programming languages,” in Proceedings of the 19th Annual ACM SIGPLAN Conference on Object-Oriented Programming, Systems, Languages, and Applications (OOPSLA), 2004, pp. 331–344. doi: 10.1145/1028976.1029004.

[68] R. Rouvoy and P. Merle, “Leveraging component-based software engineering with Fraclet,” Annals of Telecommunications, vol. 64, no. 1–2, pp. 65–79, 2009, doi: 10.1007/s12243-008-0072-z.

[69] E. Burmako, “Scala Macros: Let Our Powers Combine!,” in Proceedings of the 4th Workshop on Scala, in SCALA@ECOOP '13. 2013, p. 3:1–3:10. doi: 10.1145/2489837.2489840.

[70] S. Raemaekers, A. van Deursen, and J. Visser, “Semantic Versioning and Impact of Breaking Changes in the Maven Repository,” Journal of Systems and Software, vol. 129, pp. 140–158, 2017, doi: 10.1016/j.jss.2016.04.008.

[71] P. Lam, J. Dietrich, and D. J. Pearce, “Putting the Semantics into Semantic Versioning,” in Proceedings of the 2020 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software, in Onward! '20. 2020, pp. 157–179. doi: 10.1145/3426428.3426922.

[72] P. Abate, R. Di Cosmo, R. Treinen, and S. Zacchiroli, “Dependency Solving: A Separate Concern in Component Evolution Management,” Journal of Systems and Software, vol. 85, no. 10, pp. 2228–2240, 2012, doi: 10.1016/j.jss.2012.02.018.

[73] L. Cardelli, “Structural Subtyping and the Notion of Power Type,” in Proceedings of the 15th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '88. 1988, pp. 70–79. doi: 10.1145/73560.73566.

[74] B. Meyer, “Applying "Design by Contract",” Computer, vol. 25, no. 10, pp. 40–51, 1992, doi: 10.1109/2.161279.

[75] B. C. Pierce, “Bounded Quantification is Undecidable,” Information and Computation, vol. 112, no. 1, pp. 131–165, 1994, doi: 10.1006/inco.1994.1055.

[76] A. Haas et al., “Bringing the web up to speed with WebAssembly,” in Proceedings of the 38th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI), ACM, 2017, pp. 185–200. doi: 10.1145/3062341.3062363.

[77] M. M. Swift, B. N. Bershad, and H. M. Levy, “Improving the reliability of commodity operating systems,” in Proceedings of the 19th ACM Symposium on Operating Systems Principles (SOSP), ACM, 2003, pp. 207–222. doi: 10.1145/945445.945466.

[78] M. M. Swift, M. Annamalai, B. N. Bershad, and H. M. Levy, “Recovering device drivers,” ACM Transactions on Computer Systems, vol. 24, no. 4, pp. 333–360, 2006, doi: 10.1145/1189256.1189257.

[79] D. E. Porter, O. S. Hofmann, C. J. Rossbach, A. Benn, and E. Witchel, “Operating System Transactions,” in Proceedings of the 22nd ACM Symposium on Operating Systems Principles (SOSP), ACM, 2009, pp. 161–176. doi: 10.1145/1629575.1629591.

[80] O. Kiselyov and C.-chieh Shan, “Delimited Continuations in Operating Systems,” in Modeling and Using Context (CONTEXT 2007), in Lecture Notes in Computer Science, vol. 4635. Springer, 2007, pp. 291–302. doi: 10.1007/978-3-540-74255-5_22.

[81] E. Dolstra and A. Löh, “NixOS: a purely functional Linux distribution,” in Proceedings of the 13th ACM SIGPLAN International Conference on Functional Programming (ICFP), ACM, 2008, pp. 367–378. doi: 10.1145/1411204.1411255.

[82] ZIO, “ZIO: Type-safe, composable asynchronous and concurrent programming for Scala.” [Online]. Available: https://zio.dev/

[83] Effect, “Effect: A TypeScript library for building robust applications.” [Online]. Available: https://effect.website/

[84] G. Canti, “fp-ts: Functional programming in TypeScript.” [Online]. Available: https://github.com/gcanti/fp-ts

[85] J. I. Brachthäuser, P. Schuster, and K. Ostermann, “Effects as capabilities: effect handlers and lightweight effect polymorphism,” Proc. ACM Program. Lang., vol. 4, no. OOPSLA, 2020, doi: 10.1145/3428194.

[86] J. I. Brachthäuser, P. Schuster, E. Lee, and A. Boruch-Gruszecki, “Effects, capabilities, and boxes: from scope-based reasoning to type-based reasoning and back,” Proc. ACM Program. Lang., vol. 6, no. OOPSLA1, 2022, doi: 10.1145/3527320.

[87] C. Heunen, R. Kaarsgaard, and M. Karvonen, “Reversible Effects as Inverse Arrows,” in Proceedings of the Thirty-Fourth Conference on the Mathematical Foundations of Programming Semantics (MFPS XXXIV), in Electronic Notes in Theoretical Computer Science, vol. 341. 2018, pp. 179–199. doi: 10.1016/j.entcs.2018.11.009.

[88] D. Orchard, V.-B. Liepelt, and H. Eades III, “Quantitative program reasoning with graded modal types,” Proc. ACM Program. Lang., vol. 3, no. ICFP, 2019, doi: 10.1145/3341714.

[89] R. Bianchini, F. Dagnino, P. Giannini, E. Zucca, and M. Servetto, “Coeffects for sharing and mutation,” Proc. ACM Program. Lang., vol. 6, no. OOPSLA2, Oct. 2022, doi: 10.1145/3563319.

[90] R. Bianchini, F. Dagnino, P. Giannini, and E. Zucca, “A Java-like calculus with heterogeneous coeffects,” Theoretical Computer Science, vol. 971, p. 114063, 2023, doi: https://doi.org/10.1016/j.tcs.2023.114063.

[91] C. Torczon, E. Suárez Acevedo, S. Agrawal, J. Velez-Ginorio, and S. Weirich, “Effects and Coeffects in Call-by-Push-Value,” Proc. ACM Program. Lang., vol. 8, no. OOPSLA2, Oct. 2024, doi: 10.1145/3689750.

[92] R. Hirschfeld, P. Costanza, and O. Nierstrasz, “Context-oriented Programming,” Journal of Object Technology, vol. 7, no. 3, pp. 125–151, 2008, doi: 10.5381/jot.2008.7.3.a4.

[93] P. Costanza and R. Hirschfeld, “Language constructs for context-oriented programming: an overview of ContextL,” in Proceedings of the 2005 Symposium on Dynamic Languages (DLS '05), ACM, 2005, pp. 1–10. doi: 10.1145/1146841.1146842.

[94] G. Salvaneschi, C. Ghezzi, and M. Pradella, “Context-oriented programming: A software engineering perspective,” Journal of Systems and Software, vol. 85, no. 8, pp. 1801–1817, 2012, doi: 10.1016/j.jss.2012.03.024.

[95] G. Kiczales et al., “Aspect-Oriented Programming,” in ECOOP'97 — Object-Oriented Programming, 11th European Conference, in Lecture Notes in Computer Science, vol. 1241. Springer, 1997, pp. 220–242. doi: 10.1007/BFb0053381.

[96] G. Kiczales, E. Hilsdale, J. Hugunin, M. Kersten, J. Palm, and W. G. Griswold, “An Overview of AspectJ,” in ECOOP 2001 — Object-Oriented Programming, 15th European Conference, in Lecture Notes in Computer Science, vol. 2072. Springer, 2001, pp. 327–353. doi: 10.1007/3-540-45337-7_18.

[97] A. Popovici, T. Gross, and G. Alonso, “Dynamic Weaving for Aspect-Oriented Programming,” in Proceedings of the 1st International Conference on Aspect-Oriented Software Development (AOSD 2002), ACM, 2002, pp. 141–147. doi: 10.1145/508386.508404.

[98] J. Bonér, “What Are the Key Issues for Commercial AOP Use: How Does AspectWerkz Address Them?,” in Proceedings of the 3rd International Conference on Aspect-Oriented Software Development (AOSD 2004), ACM, 2004, pp. 5–6. doi: 10.1145/976270.976273.

[99] M. Hicks, J. T. Moore, and S. Nettles, “Dynamic Software Updating,” in Proceedings of the ACM SIGPLAN 2001 Conference on Programming Language Design and Implementation, in PLDI '01. 2001, pp. 13–23. doi: 10.1145/378795.378798.

[100] G. Stoyle, M. Hicks, G. Bierman, P. Sewell, and I. Neamtiu, “Mutatis Mutandis: Safe and Predictable Dynamic Software Updating,” in Proceedings of the 32nd ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages, in POPL '05. 2005, pp. 183–194. doi: 10.1145/1040305.1040321.

[101] C. M. Hayden, K. Saur, E. K. Smith, and M. Hicks, “Kitsune: Efficient, General-Purpose Dynamic Software Updating for C,” ACM Trans. Program. Lang. Syst., vol. 36, no. 4, 2014, doi: 10.1145/2629460.

[102] M. Overeem, M. Spoor, and S. Jansen, “The Dark Side of Event Sourcing: Managing Data Conversion,” in IEEE 24th International Conference on Software Analysis, Evolution and Reengineering, in SANER '17. 2017, pp. 193–204. doi: 10.1109/SANER.2017.7884621.

[103] E. Gamma, R. Helm, R. Johnson, and J. Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software. Boston, MA: Addison-Wesley, 1994.

[104] D. Leijen, “Algebraic Effect Handlers with Resources and Deep Finalization,” technical report MSR-TR-2018-10, Apr. 2018. [Online]. Available: https://www.microsoft.com/en-us/research/publication/algebraic-effect-handlers-resources-deep-finalization/

[105] M. Fowler, “Event Sourcing.” 2005.

[106] J. Lee, J. Ahn, and K. Yi, “React-tRace: A Semantics for Understanding React Hooks,” Proc. ACM Program. Lang., vol. 9, no. OOPSLA2, pp. 471–498, 2025, doi: 10.1145/3763067.

[107] N. Shavit and D. Touitou, “Software Transactional Memory,” in Proceedings of the Fourteenth Annual ACM Symposium on Principles of Distributed Computing, in PODC '95. 1995, pp. 204–213. doi: 10.1145/224964.224987.

[108] T. Harris, S. Marlow, S. Peyton Jones, and M. Herlihy, “Composable Memory Transactions,” in Proceedings of the Tenth ACM SIGPLAN Symposium on Principles and Practice of Parallel Programming, in PPoPP '05. 2005, pp. 48–60. doi: 10.1145/1065944.1065952.

[109] M. Herlihy and J. E. B. Moss, “Transactional Memory: Architectural Support for Lock-Free Data Structures,” in Proceedings of the 20th Annual International Symposium on Computer Architecture, in ISCA '93. 1993, pp. 289–300. doi: 10.1145/165123.165164.

[110] R. Landauer, “Irreversibility and Heat Generation in the Computing Process,” IBM Journal of Research and Development, vol. 5, no. 3, pp. 183–191, 1961, doi: 10.1147/rd.53.0183.

[111] C. H. Bennett, “Logical Reversibility of Computation,” IBM Journal of Research and Development, vol. 17, no. 6, pp. 525–532, 1973, doi: 10.1147/rd.176.0525.

[112] T. Yokoyama and R. Glück, “A Reversible Programming Language and its Invertible Self-Interpreter,” in Proceedings of the 2007 ACM SIGPLAN Workshop on Partial Evaluation and Semantics-Based Program Manipulation, in PEPM '07. 2007, pp. 144–153. doi: 10.1145/1244381.1244404.

[113] V. Danos and J. Krivine, “Reversible Communicating Systems,” in CONCUR 2004 — Concurrency Theory, 15th International Conference, in Lecture Notes in Computer Science, vol. 3170. Springer, 2004, pp. 292–307. doi: 10.1007/978-3-540-28644-8_19.

[114] I. Phillips and I. Ulidowski, “Reversing Algebraic Process Calculi,” in Foundations of Software Science and Computation Structures, 9th International Conference (FOSSACS 2006), in Lecture Notes in Computer Science, vol. 3921. Springer, 2006, pp. 246–260. doi: 10.1007/11690634_17.

[115] P. Wadler, “Linear Types Can Change the World!,” in Programming Concepts and Methods: Proceedings of the IFIP Working Group 2.2/2.3 Working Conference, North-Holland, 1990, pp. 561–581. [Online]. Available: https://homepages.inf.ed.ac.uk/wadler/papers/linear/linear.ps

[116] A. Lenharth, V. S. Adve, and S. T. King, “Recovery domains: an organizing principle for recoverable operating systems,” in Proceedings of the 14th International Conference on Architectural Support for Programming Languages and Operating Systems (ASPLOS), ACM, 2009, pp. 49–60. doi: 10.1145/1508244.1508251.

[117] C. Walls, Spring in Action, 6th ed. Manning Publications, 2022. [Online]. Available: https://www.manning.com/books/spring-in-action-sixth-edition

[118] C. Escoffier, R. S. Hall, and P. Lalanda, “iPOJO: an Extensible Service-Oriented Component Framework,” in IEEE International Conference on Services Computing, 2007, pp. 474–481. doi: 10.1109/SCC.2007.74.

[119] H. Cervantes and R. S. Hall, “Autonomous Adaptation to Dynamic Availability Using a Service-Oriented Component Model,” in Proceedings of the 26th International Conference on Software Engineering, in ICSE '04. 2004, pp. 614–623. doi: 10.1109/ICSE.2004.1317483.

[120] C. Elliott and P. Hudak, “Functional Reactive Animation,” in Proceedings of the Second ACM SIGPLAN International Conference on Functional Programming, in ICFP '97. 1997, pp. 263–273. doi: 10.1145/258948.258973.

[121] G. H. Cooper and S. Krishnamurthi, “Embedding Dynamic Dataflow in a Call-by-Value Language,” in Programming Languages and Systems (ESOP 2006), in Lecture Notes in Computer Science, vol. 3924. Springer, 2006, pp. 294–308. doi: 10.1007/11693024_20.

[122] I. Maier and M. Odersky, “Deprecating the Observer Pattern with Scala.React,” technical report EPFL-REPORT-176887, 2012. [Online]. Available: https://infoscience.epfl.ch/record/176887

[123] E. Bainomugisha, A. L. Carreton, T. Van Cutsem, W. De Meuter, and others, “A Survey on Reactive Programming,” ACM Comput. Surv., vol. 45, no. 4, 2013, doi: 10.1145/2501654.2501666.

[124] A. Margara and G. Salvaneschi, “On the Semantics of Distributed Reactive Programming: The Cost of Consistency,” IEEE Trans. Software Eng., vol. 44, no. 7, pp. 689–711, 2018, doi: 10.1109/TSE.2018.2833109.
