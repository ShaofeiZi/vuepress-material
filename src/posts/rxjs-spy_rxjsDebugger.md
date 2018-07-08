---
title:  rxjs-spy：RxJS Debugger 神器
date: 2018-07-07 10:02:01
tags: [Rxjs, rxjs-spy, Debugger,Angular]
description: JavaScript 如何获取输入时的光标位置，在光标处插入或替换内容
--- 

rxjs-spy，是一款专门用来 debugger RxJS的插件，通过rxjs-spy，我们可以很轻易的在网页执行阶段理解每一步operator的动作，同时调整现有的observable，来验证不同逻辑带来的结果，最棒的是，整个过程几乎不用动到原来的代码，可以说是非常方便的一款library，今天我们就来看看这个神奇的RxJS Debugger 神器－rxjs-spy吧！
![](/images/rxjs-spy.png)

<!-- more -->
[Demo](https://github.com/ShaofeiZi/test-rxjs-spy)

[rxjs-spy](https://github.com/cartant/rxjs-spy)

[官方栗子](https://cartant.github.io/rxjs-spy/)
## RXJS 的爱恨情仇

RxJS虽然带来了很方便的开发体验，但要上手跟熟悉，其实是有比较大门槛的，尤其是operators帮我们将很多行为都包装的好情境下，反而容易造成无法理解运行原理，以及debugger不方便等问题。

为了debugger方便，使用do或是pipeable的tap，打印出资料应该是最常见的手段，例如：
```typescript
Observable.interval(1000).do(value => {
    console.log(value);
})

Observable.interval(1000).pipe(
    tap(value => {
        console.log(value);
    })
)
```
不过这样很容易造成程序里面一堆不必要的do或tap，这样的方式其实会产生不少dirty code，而且当 Debugger 完毕后，还要逐个清理，不然反而会在日后进行其他 Debugger 工作时，console反而印出一堆未清除的杂讯。

因此，我们需要一套好用的工具，来帮助我们更加优雅地针对RxJS进行 Debugger ，也就是今天介绍的主题：rxjs-spy

## 关于rxjs-spy
rxjs-spy是用来方便针对RxJS Debugger 的一套library，它可以再尽量不要弄脏代码的前提下，印出RxJS的资讯；通过rxjs-spy，我们可以很轻松地针对某个串好的observable进行侦错，在console上看到输出资讯，而且随时可以中断，甚至可以在执行期间替换某个observable；非常的方便！接下来就让我们来看看rxjs-spy的神奇魔术吧！

## 使用rxjs-spy来 Debugger RxJS
由於RxJS大量被使用在Angular框架中，因此我们使用Angular框架来做示范，但实际上，在任何框架中只要有使用到RxJS，都可以很轻松地通过rxjs-spy来进行侦错。

## 安装rxjs-spy
要安装rxjs-spy非常简单，通过npm或yarn即可，这已经算是前端起手式了
```
npm install --save-dev rxjs-spy
```
接著我们就可以在main.ts中建立一个rxjs的spy
```typescript
import { create } from 'rxjs-spy';
const spy = create();
```
main.ts是Angular框架执行的起点，在其他类型的框架中，可以自行找出应用程序的起点加入

替observable加上tag
以下是一个简单的Angular与RxJS的程序范例，通过Observable.timer()与switchMap()每5秒产生一次request向后端要资料，同时，通过使用rxjs-spy扩充的tag方法，替想要 Debugger 的observable加上一个方便记忆的标志。
rxjs-spy的tag方法支持chain和pipeable两种，但是新版本RXJS6 为了打包 强制使用pipe
```typescript
import { tag } from 'rxjs-spy/operators/tag';

@Component({ })
export class AppComponent {
   post$ = Observable.timer(0, 5000).pipe(
    tag('app-timer'),
    switchMap((duration) => {
      return this.httpClient.get<any>(`https://jsonplaceholder.typicode.com/posts/${duration % 10 + 1}`)
    }),
    tag('app-timer')
  );

  constructor(private httpClient: HttpClient) { }
}
```
RXJS5中可以这么写
```
post$ = Observable.timer(0, 5000)
  .tag('app-timer')
  .switchMap((duration) => {
    return this.httpClient.get<any>(`https://jsonplaceholder.typicode.com/posts/${duration % 10 + 1}`)
  })
  .tag('app-timer');
```
看习惯的不同而已，不管是chain还是pipeable，实际上都是回传一个observer，而tag的概念就是在这个observer加上一个标签，方便rxjs-spy了解目前有多少个observer是需要被监控的。

有了基本概念后，就可以开始来试玩啦！

接下来我们完全不会再去动到任何的代码，全部事情都在浏览器的console运作，

> 为了方便看出debug成果，上述程序并没有做production build，因此代码偏大(约3MB)，请稍微耐心等候。

> rxjs-spy官方的网站也有载入同样监控代码，因此我们也可以到rxjs-spy练习一样的过程，只是监听的tag不同而已。

使用rxSpy.show()列出所有被监听的observables
接下来让我们打开开发人员工具(F12)，在console下输入rxSpy.show()，看看会发生什麼事情：
![](/images/rxjs-spy.png)

可以看到console列出了我们目前定义好的tags，以及这个tag在RxJS中被chain或pipe后的顺序，还有目前的状态，很酷吧！

> 值得说明一下的是，在observable还未被subscribe前，rxjs-spy是不会把这些未被subscribe的tag列出来的！
 
### 显示某个tag
如果只想显示某个tag的资讯，例如app-timer可以在参数后加上名称，例如`rxSpy.show('app-timer')`。

使用regular expression搜寻
我们也能够过regular expression来搜寻tags，例如：`rxSpy.show(/^app-*/)`可以找出所有`app-`开头的tags。

后续介绍的方法，几乎都能使用同样的方式来处理某个tag

### 使用rxSpy.log()开始记录某个observable的运作
如果想要纪录某个observable每次输出的值，可以使用`rxSpy.log({name})`，例如下图，我们开始记录app-timer这个tag每次输出的结果，输入`rxSpy.log('app-timer')`即可：


对于要追踪比较observable的变化时非常方便！

使用rxSpy.let()切换observable
如果我们在debug的情境下，想要尝试看看把某个observer换掉，只要通过rxSpy.let()，就可以做到不用改程序，而是直接在console下就能够替换：
```typescript
rxSpy.let('people', source => source.mapTo('mallory'));
```
需要注意的是，rxSpy.let()只有在把整个RxJS都加入时才实用，以Angular框架(或精准的说：ES6语法)来说，因为都只import要用的operator，因此即使用了rxSpy.let()，没有可用的operator也无法正确的替换，想要达到替换功能的话，可以在environment.ts中加入import 'rxjs/Rx'，来达到把所有operators加入的动作，而在production build时，因为environment.prod.ts没有加入所有的RxJS，所以不用担心代码太大的问题。

在小小踩了一下雷之后，我们继续来用范例学习如何使用rxSpy.let()，假如我们想要暂时换掉app-timer的内容，可以使用以下语法：
```typescript
rxSpy.let('app-timer', source => source.mapTo({title: 'test title', body: 'test body'}))
```
再来看看结果：


果然就换成新的observable资料啦！

### 使用rxSpy.undo()还原步骤
刚刚我们使用`rxSpy.let()`暂时将app-timer的observable换掉，如果想要还原这个步骤，可以使用`rxSpy.undo()`，在不加任何参数的时候，会记录所有可以还原的步骤：


其中第2个步骤就是我们使用`rxSpy.let()`的结果，因此我们可以通过`rxSpy.undo(2)`来还原这个步骤：


### 使用`rxSpy.pause()`暂停observable
如果某个observable持续在变化，可能会造成画面不断变更，而影响侦错，这时候我们可以通过rxSpy.pause()来暂停某个
```typescript
observable，ex：rxSpy.pause('app-timer')。
```
`rxSpy.pause()`会回传一个Deck 事件，这个 事件有很多好用的方法，例如最简单的`resume()`，如果想要重新恢复暂停的observable，就可以通过这个方法：
```typescript
const deckPost = rxSpy.pause('app-timer');
deckPost.resume();
```
当`rxSpy.pause()`的时候，observable的变化会被当作一步一步的steps被暂存起来，当使用`rxSpy.resume()`时，这些steps的变更会一次完成，而Deck里面还有几个非常有趣的API，方便我们一步一步进行 Debugger ：

- step()：执行一次变更，例如原本在id=6时暂停，持续发生变化后使用`deck.step()`，会得到id=7的结果。
- skip()：跳过一次变更，例如原本在id=6时暂停，之后使用`deck.skip()`，id=7就不会发生，此时再接著用`deck.step()`时，就会变成id=8。
- clear()：清空所有的变更。

本日小结
今天我们大致介绍了rxjs-spy这个RxJS的 Debugger 神器，以及部分的好用API，来协助我们优雅地针对RxJS进行 Debugger ，而不用去改动太多的代码，更不用做一堆事后清理的工作，让我们的代码能够持续简洁，又不用担心RxJS难以 Debugger 的问题，这样就少一个不去学RxJS的理由了吧XD