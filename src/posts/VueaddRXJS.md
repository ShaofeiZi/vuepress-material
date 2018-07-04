---
title: RxJS实践，Vue如何集成RxJS
tags: [VUE, RxJS,vue-rx]
date: 2018-07-04 01:41:21
---

本文章不会对RxJS的原理进行讲解，仅讨论如何在vue中对RxJS进行集成
<!-- more -->

[关于RXJS的几篇](https://shaofeizi.github.io/BLOG/tags/RXJS/)

[RxJS 5 中文文档](https://github.com/RxJS-CN/RxJS-Docs-CN)

[RxJS 5 ultimate 中文版](https://rxjs-cn.github.io/rxjs5-ultimate-cn/)

# Vue简单集成RxJS
想要在Vue中使用RxJS，只需要如下引用即可，当然，更多引用方法可以参考官方文档，比如按需引入
```javascript
import Rx from 'rxjs/Rx'
 // 如果你想在vue中使用RxJS的体验更好，这里推荐使用vue-rx这个官方维护的库，使用如下：
import Vue from 'vue'
import VueRx from 'vue-rx'
import Rx from 'rxjs/Rx'

Vue.use(VueRx, Rx)

```

这样，在Vue实例当中就会多了subscriptions这个钩子函数，他的用法类似data，使用如下所示：
```vue
<template>
    <div>
        <span>姓名：{{ name$ }}</span>
        <span>年龄：{{ age$ }}</span>
        <button v-stream:click="setName$">点击设置name的值</button>
    </div>
</template>

<script>
export default {
    domStreams: [
        'setName$'
    ],
    subscriptions () {
        return {
            age$: Rx.Observable.of(23)
                .map(data => data),
            name$: this.setName$
                .map(e => 'myName')
                .startWith('')
        }
    }
}
</script>

```

如上所示，Rx.Observable.of(23)在被订阅时会被发出值23，this.setName$则是一个流事件，它在domStreams中定义，实际它是一个Subject（具体可查阅RxJS中对Subject的定义），在用户点击按钮的时候则会发出该点击源的数据，如上图的map operator中，会接收数据源发出的event对象（这里我们没有使用该对象，仅仅是返回一个我们定义的字符串'myName'），startWith则是初始化name$的值为空字符串，这里vue-rx已经帮我们做了一个隐式的subscribe绑定，所以值23会马上发出最后赋值到age$上，进而绑定到视图，在这里，我们可以把age$与name$看成是一个有数据源发出的可观察流的结果，这条流是响应的，初始发出的值会经过各种operator处理后响应到页面上。


# 集成vue-rx后使用RxJS

[集成后demo](https://github.com/ShaofeiZi/vue-rxjs-demo)

该项目采取了parcel构建、示例包括原生使用与集成vue-rx后使用的对比、事件如何使用、以及常用operator的示例（包含switchMap、concatMap、exhaustMap等的使用场景选择）
## 创建Observeble
```
<template>
  <div>
    <h3>demo2 创建将数据转化成Observable方式</h3>
    <p>字符串：{{ str$ }}</p>
    <p>
      数组: 
      <span v-for="(num, index) in arr$" :key="index">{{ num }}</span>
    </p>
    <p>对象：{{ obj$.a }}</p>
    <p>布尔值：{{ bool$ }}</p>
    <p>promise：{{ promise$ }}</p>
    <p>interval: {{ interval$ }}</p>
  </div>
</template>

<script>
import Rx from 'rxjs/Rx'

export default {
  subscriptions () {
    return {
      /**
       * 普通数据类型都可以用of进行转换
       * promise对象可用from或者fromPromise
       * interval可在给定时间区间内发出自增数字
       */
      str$: Rx.Observable.of('str'),
      arr$: Rx.Observable.of([1, 2, 3]),
      obj$: Rx.Observable.of({ 
        a: 'test-obj' 
      }),
      bool$: Rx.Observable.of(true),
      promise$: Rx.Observable.fromPromise(this.getPromise()),
      interval$: Rx.Observable.interval(1000)
    }
  },
  methods: {
    getPromise () {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('promise')
        }, 1000)
      })
    }
  }
}
</script>

```

创建数据流后，用法类似data，可将数据流的结果跟视图进行绑定

## 事件的使用
### 没有集成vue-rx
```
export default {
  ...

  // 需要获取dom，所以必须是mounted后执行才能成功
  mounted () {
    // fromEvent可以将dom绑定事件并转化成Observable可观察对象
    Rx.Observable.fromEvent(this.$refs['btn'], 'click')
      .subscribe(e => {
        this.data = '成功获取data'
      })
  },

  ... 
}


```
### 集成vue-rx后
```
<template>
  <button class="btn" v-stream:click="getData$">点击获取数据</button>
</template>

<script>
export default {
  ...

  // v-stream事件可以统一写在这里，具体可以看vue-rx的使用
  domStreams: [
    'getData$'
  ],
  subscriptions () {
    return {
      data$: this.getData$
        // map操作符主要用于映射数据，这里我们直接返回了一个字符串
        .map(e => {
          return '成功获取data'
        })
    }
  }
}
</script>

```

## switchMap、concatMap、exhaustMap使用
一般这几个operator，会与http请求结合使用，下面我们看些简单用法，点击后将当前流映射成新的流
```
<template>
  <div>
    <h3>demo4 各种map方法运用</h3>
    <button class="btn" v-stream:click="getConcatMapCount$">点击获取concatMapCount$</button>
    <p>{{ concatMapCount$ }}</p>
    <button class="btn" v-stream:click="getSwitchMapCount$">点击获取switchMapCount$</button>
    <p>{{ switchMapCount$ }}</p>
    <button class="btn" v-stream:click="getExhaustMapCount$">点击获取exhaustMapCount$</button>
    <p>{{ exhaustMapCount$ }}</p>
  </div>
</template>

<script>
import Rx from 'rxjs/Rx'

export default {
  data () {
    return {
      count: 0
    }
  },
  domStreams: [
    'getConcatMapCount$',
    'getSwitchMapCount$',
    'getExhaustMapCount$'
  ],
  subscriptions () {
    /**
     * 下面的operator会把一个Observable转化成另外一个Observable
     * 通过返回一个观察流继续处理数据
     */
    return {
      /**
       * 当你连续点击按钮多次获取数据时，cancatMap会将获取到的数据按队列发出
       */
      concatMapCount$: this.getConcatMapCount$
        .concatMap((e) => {
          return Rx.Observable.from(this.getCount())
        }),
      /**
       * 当你连续点击按钮多次获取数据时，switchMap只会将最后一个点击发出的值发出，前面发出的值会被吞掉
       */
      switchMapCount$: this.getSwitchMapCount$
        .switchMap((e) => {
          return Rx.Observable.from(this.getCount())
        }),
      /**
       * 当你连续点击按钮多次时，exhaustMap仅执行一次，在第一次值发出后，才可以继续点击下一次发出值
       */
      exhaustMapCount$: this.getExhaustMapCount$
        .exhaustMap(e => {
          return Rx.Observable.from(this.getCount())
        })
    }
  },
  methods: {
    getCount () {
      return new Promise((resolve, reject) => {
        this.count++
        setTimeout(() => {
          resolve(this.count)
        }, 2000)
      })
    }
  }
}
</script>

```

上面的getCount当成是2秒后响应的http请求，当你连续点击的时候，这几个map operator会有不一样的行为。
- concatMap在多次点击后会每隔两秒就发送一个递增的count
- switchMap在多次点击后，会只发出最后一次点击的count，比如我点了3次，switchMapCount$在2秒后会显示3，而不是1.
- exhaustMap则是第一次点击没有响应前不会执行后续的点击操作，直到响应后的点击才有效。

# 关于Rx5与Rx6
上面的仓库是基于Rx5编写的示例，而新出的Rx6在api上有些变动，调用operator的方式不再是链式调用，而是通过传入pipe operator进行组合使用，还有Observable对象的引用也发生了改变，具体可以参考官方文档

[RXJS6 官网](http://rxjsdocs.com)
