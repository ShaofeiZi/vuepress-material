---
title: 00关于本系列文章
date: 2018-04-28 12:15:53
tags: [RXJS]
---
# 30 天精通 RxJS (00)： 关于本系列文章

>
> 
> 就如同罗辑思维罗胖老师所说的，在这资讯爆炸的时代，所有的内容生产者要思考一个新维度，那就是我们能帮读者节省多少的时间？这系列文章的核心目标就是帮助读者节省学习 RxJS 的时间，尽可能地以最低的成本精通 RxJS！
> 
> 
<!-- more -->
![RxJS Logo](https://raw.githubusercontent.com/Reactive-Extensions/RxJS/master/logos/logo.png)

## 前言

笔者从去年就一直想参加铁人赛 30 天，一方面是希望利用机会把自己的所学做一次整理，另一方面想训练自己组织文章的能力。去年的时候我想写 ECMAScript 2015，也准备了一段时间，结果没想到去年停办了一年。

今年总算让我成功地参加铁人赛 30 天，虽然没有很充裕的准备时间，但我会尽可能地把每个观念、每个细节写清楚，也希望我能坚持到最后！

> 
> 
> 你问我，我是谁？ 我是一名前端工程师，为了保留一点神秘感就不多做自我介绍了。
> 
> 

## 为什么写 [RxJS](https://github.com/ReactiveX/rxjs) ？

其实今年笔者一直在下面这三个主题中犹豫，不知道该选哪一个...

*   ECMAScript 2015 (ES6)
*   RxJS
*   Universal JavaScript

最一开始是想写 ECMAScript 2015 的，但一年过去了，在网路上相关的中文资源已经非常多，大部分的前端工程师也或多或少有在接触，对我来说我不太喜欢写已经有很多人写过的主题。

后来是在 Universal JS 跟 RxJS 中犹豫，这两个主题都是目前中文资源较为缺乏的，而且受众也较 ES6 小很多，算是比较大的挑战。后来权衡之下，认为 Universal JS 的牵涉范围太广，不易写深，且对前端工程师来说有著一定的门槛，所以还是选了受众相对较多的 RxJS。

但 RxJS 仍然是一个不容易撰写的主题，主要原因是整体观念较为抽象不好解释，另外网路上的资源几乎都是英文，且有些资源已经过时，难以判断是否仍然适用。对笔者来说绝对是一个巨大的挑战！

当然 RxJS 是笔者认为未来两三年内会变得非常红的一套 Library，主要原因有三：

*   Reactive Programming 的兴起
*   Observable 标准化
*   多语言的支持

### Reactive Programming（响应式编程） 的兴起

Reactive Programming 是 RxJS 最重要的核心观念之一，我们会在明天做比较深入的介绍。

如果有在关注 Vue 的工程师，应该会知道 [Vue.js](https://vuejs.org/) 的底层就是采用了 Reactive Programming 的观念来实例的，另外 Vue 官方也在 11 月推出了 [vue-rx](https://github.com/vuejs/vue-rx)。

另一方面 [Angular 2](https://github.com/angular/angular) 也全面引用了 RxJS，不管是在 http 还是 animation 都用了 RxJS 的 Observable！

[Redux](https://github.com/reactjs/redux) 也在 [3.5 版](https://github.com/reactjs/redux/releases/tag/v3.5.0)中加入了对 Observable 操作的支持。

从这几个前端的主流 Framework (或 Library) 就能明显地看出这个趋势，大家都在往这个方向走。

> 
> 
> 笔者也在今年 [JSDC.tw 演讲](https://youtu.be/YoKuUNz5J2M?t=5m2s)中提到，目前前端框架同质化的程度越来越高，很多观念会在各个不同的 Library 或 Framework 中通用！
> 
> 

### Observable 标准化

还有一个最重要的重点是 Observable 将会被加入 ECMAScript 的标准(应该会在 ES7 推出，我相信 [Jafar](https://twitter.com/jhusain) 不会骗我)。
另外 RxJS 现在推出了[第 5 版](https://github.com/ReactiveX/rxjs/releases/tag/5.0.0)，这个版本最重要的目标，就是要符合目前 [Observable 提案的规格](https://github.com/tc39/proposal-observable)(当然还有效能的优化)。

> 
> 
> RxJS 在三天前发布了第五版！
> 
> 

> 
> 
> ECMAScript 不是一个新的语言，它是 JavaScript 的一份规格书，所有的浏览器厂家会依照这份规格书去实例出 JavaScript。
> 
> 

> 
> 
> Jafar Husain： TC-39 成员，RxJS 的大力推广者，目前是 Netflix Cross-Team Technical Leader，同时也是 [falcor](https://github.com/Netflix/falcor) 的作者之一。
> 
> 

### 多语言的支持

其实类似 RxJS 的 Library 还不少，像是 [xstream](https://github.com/staltz/xstream), [Bacon.js](https://baconjs.github.io/), [most.js](https://github.com/cujojs/most) 等，那为什么会选 RxJS 呢？

除了我们前面提到 RxJS 5 的推出，将符合标准规格之外，Rx 还有多个语言支持，几乎所有主流的程式语言都有 Rx 的 Library，像是 [RxRuby](https://github.com/ReactiveX/RxRuby), [RxPy](https://github.com/ReactiveX/RxPY), [RxJava](https://github.com/ReactiveX/RxJava)...等，不管以后怎麽切换语言，几乎只要学一次就随处可用。

从各主流的 Framework 及 Library 纳入 Observable，到将被加入 ES 的标准规格中，还能有跨语言的支持，这就是为什么我认为 RxJS 会红的原因，相信这波浪潮很快就会席卷台湾的前端社群！

## 目标

希望这 30 天的文章，尽可能的涵盖 RxJS 所有项目，并且以浅显易懂的方式解释及表达给所有读者，让读者能在最短的时间内，以最低的成本学会 RxJS，这就是本系列文章最重要的目标！

另外本系列文章会以 RxJS 第 5 版为主，所有的示例及 API 都会依照最新的版本撰写。

为了尽可能的降低读者的学习成本，本系列的每篇文章会尽量压缩在 1500 字以内，让读者每天最多花 20 分钟就能读完，并且会在较难理解的文章附上视频讲解，让读者能更轻鬆的吸收！

## 大纲规划

*   核心观念篇 (5天)：介绍 Rx 相关的核心观念，及前置知识等。
*   Observable (12～14天)：讲解 Observable 及其方法，并会搭配简单的示例和使用场景。
*   Subject (5～6天)：讲解 Subject，包含观念以及各种不同的子类别。
*   实际应用 (4～6天)：会选实际上较为複杂的需求，作为一段学习的完整应用练习。

目前的规划大致如上，也有可能在做改动，如果时间够充裕也可能会再补上 Rx 的 Schedulers。

## 问题与讨论

如果读者对于文章内容有任何疑问或是建议，可以直接在留言区留言给我，我会看每一则留言！